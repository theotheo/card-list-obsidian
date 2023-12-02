import {
  addIcon,
  App,
  getIcon,
  ItemView,
  Menu,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';

interface FilePath {
  path: string;
  basename: string;
}

interface CardListData {
  recentFiles: FilePath[];
  omittedPaths: string[];
  maxLength: number;
  openType: string;
  datetime_field: string;
}

const defaultMaxLength: number = 50;

const DEFAULT_DATA: CardListData = {
  recentFiles: [],
  omittedPaths: [],
  maxLength: null,
  openType: 'tab',
  datetime_field: 'created_at'
};

const CardListViewType = 'card-list';

class CardListView extends ItemView {
  private readonly plugin: RecentFilesPlugin;
  private data: CardListData;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: RecentFilesPlugin,
    data: CardListData,
  ) {
    super(leaf);

    this.plugin = plugin;
    this.data = data;
  }

  public async onOpen(): Promise<void> {
    this.redraw();
  }

  public getViewType(): string {
    return CardListViewType;
  }

  public getDisplayText(): string {
    return 'Card List';
  }

  public getIcon(): string {
    return 'clock';
  }

  public onHeaderMenu(menu: Menu): void {
    menu
      .addItem((item) => {
        item
          .setTitle('Clear list')
          .setIcon('sweep')
          .onClick(async () => {
            this.data.recentFiles = [];
            await this.plugin.saveData();
            this.redraw();
          });
      })
      .addItem((item) => {
        item
          .setTitle('Close')
          .setIcon('cross')
          .onClick(() => {
            this.app.workspace.detachLeavesOfType(CardListViewType);
          });
      });
  }

  public load(): void {
    super.load();
    this.registerEvent(this.app.workspace.on('file-open', this.update));
  }

  public readonly redraw = (): void => {
    const openFile = this.app.workspace.getActiveFile();

    const rootEl = createDiv({ cls: 'nav-folder mod-root' });
    const childrenEl = rootEl.createDiv({ cls: 'nav-folder-children' });

    const imageUrl = /!\[\[(.*\.(?:jpe?g|png))\]\]/;

    // const adapter = this.app.vault.adapter as FileSystemAdapterWithInternalApi;

    this.data.recentFiles.forEach(async (currentFile) => {

      const card = childrenEl.createDiv({ cls: 'card-container nav-file card-list-file' });
      const textContainer = card.createDiv({ cls: 'text-container' });
      const title = textContainer.createEl('h4', {cls: 'card-list-title'});
      const textSnippet = textContainer.createEl('p', { cls: 'text-snippet' });
      const details = textContainer.createDiv({ cls: 'details' });
      const date = details.createEl('p', { cls: 'date' });
      const tags = details.createEl('p', { cls: 'tags' });

      const markdownFilePath = currentFile.path

      const markdownFile = app.vault.getAbstractFileByPath(markdownFilePath)
      const content = await app.vault.adapter.read(markdownFilePath)
      const metadata = app.metadataCache.getFileCache(markdownFile as TFile)

      title.setText(currentFile.basename)


      
      if (metadata.frontmatter) {
        const withoutFrontmatter = content.split('---', 3)[2]
        textSnippet.setText(withoutFrontmatter.substring(0, 265));

        const created_at = moment(metadata.frontmatter[this.data.datetime_field])

        date.textContent = created_at.format('MMM DD')
        tags.textContent = metadata.frontmatter.tags?.reduce((result: string, tag: string) => `${result} #${tag}`, '')

      }

      const matches = content.match(imageUrl)
      if (matches) {
        const imgPath = matches[1];
        const imgFullPath = app.metadataCache.getFirstLinkpathDest(imgPath, markdownFilePath)

        const imageContainer = card.createDiv({ cls: 'image-container' });
        const img = imageContainer.createEl('img')

        img.src = this.app.vault.getResourcePath(imgFullPath);
        img.alt = currentFile.basename;
      }

      if (openFile && currentFile.path === openFile.path) {
        card.addClass('is-active');
      }

      card.setAttr('draggable', 'true');
      card.addEventListener('dragstart', (event: DragEvent) => {
        const file = this.app.metadataCache.getFirstLinkpathDest(
          currentFile.path,
          '',
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dragManager = (this.app as any).dragManager;
        const dragData = dragManager.dragFile(event, file);
        dragManager.onDragStart(event, dragData);
      });

      card.addEventListener('mouseover', (event: MouseEvent) => {
        this.app.workspace.trigger('hover-link', {
          event,
          source: CardListViewType,
          hoverParent: rootEl,
          targetEl: card,
          linktext: currentFile.path,
        });
      });

      card.addEventListener('contextmenu', (event: MouseEvent) => {
        const menu = new Menu(this.app);
        const file = this.app.vault.getAbstractFileByPath(currentFile.path);
        this.app.workspace.trigger(
          'file-menu',
          menu,
          file,
          'link-context-menu',
        );
        menu.showAtPosition({ x: event.clientX, y: event.clientY });
      });

      card.addEventListener('click', (event: MouseEvent) => {
        this.focusFile(currentFile, event.ctrlKey || event.metaKey);
      });

      const navFileDelete = card.createDiv({ cls: 'card-list-file-delete menu-item-icon' })
      navFileDelete.appendChild(getIcon('lucide-x'));
      navFileDelete.addEventListener('click', async () => {
        await this.removeFile(currentFile);
        this.redraw();
      })
    });

    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    contentEl.appendChild(rootEl);
  };

  private readonly removeFile = async (file: FilePath): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(
      (currFile) => currFile.path !== file.path,
    );
    await this.plugin.pruneLength(); // Handles the save
  }

  private readonly updateData = async (file: TFile): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(
      (currFile) => currFile.path !== file.path,
    );
    this.data.recentFiles.unshift({
      basename: file.basename,
      path: file.path,
    });

    await this.plugin.pruneLength(); // Handles the save
  };

  private readonly update = async (openedFile: TFile): Promise<void> => {
    if (!openedFile || !this.plugin.shouldAddFile(openedFile)) {
      return;
    }

    await this.updateData(openedFile);
    this.redraw();
  };

  /**
   * Open the provided file in the most recent leaf.
   *
   * @param shouldSplit Whether the file should be opened in a new split, or in
   * the most recent split. If the most recent split is pinned, this is set to
   * true.
   */
  private readonly focusFile = (file: FilePath, shouldSplit = false): void => {
    const targetFile = this.app.vault
      .getFiles()
      .find((f) => f.path === file.path);

    if (targetFile) {
      let leaf = this.app.workspace.getMostRecentLeaf();

      const createLeaf = shouldSplit || leaf.getViewState().pinned;
      if (createLeaf) {
        if (this.plugin.data.openType === 'split')
          {leaf = this.app.workspace.getLeaf('split');}
        else if (this.plugin.data.openType === 'window')
          {leaf = this.app.workspace.getLeaf('window');}
        else
          {leaf = this.app.workspace.getLeaf('tab');}
      }
      leaf.openFile(targetFile);
    } else {
      new Notice('Cannot find a file with that name');
      this.data.recentFiles = this.data.recentFiles.filter(
        (fp) => fp.path !== file.path,
      );
      this.plugin.saveData();
      this.redraw();
    }
  };
}

export default class RecentFilesPlugin extends Plugin {
  public data: CardListData;
  public view: CardListView;

  public async onload(): Promise<void> {
    console.log('Card List: Loading plugin v' + this.manifest.version);

    await this.loadData();

    addIcon('sweep', sweepIcon);

    this.registerView(
      CardListViewType,
      (leaf) => (this.view = new CardListView(leaf, this, this.data)),
    );

    this.addCommand({
      id: 'card-list-open',
      name: 'Open',
      callback: async () => {
        let [leaf] = this.app.workspace.getLeavesOfType(CardListViewType);
        if (!leaf) {
          leaf = this.app.workspace.getLeftLeaf(false);
          await leaf.setViewState({ type: CardListViewType });
        }

        this.app.workspace.revealLeaf(leaf);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).registerHoverLinkSource(
      CardListViewType,
      {
        display: 'Card List',
        defaultMod: true,
      },
    );

    if (this.app.workspace.layoutReady) {
      this.initView();
    } else {
      this.registerEvent(this.app.workspace.on('layout-ready', this.initView));
    }

    this.registerEvent(this.app.vault.on('rename', this.handleRename));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete));

    this.addSettingTab(new CardListSettingTab(this.app, this));
  }

  public onunload(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.app.workspace as any).unregisterHoverLinkSource(
      CardListViewType,
    );
  }

  public async loadData(): Promise<void> {
    this.data = Object.assign(DEFAULT_DATA, await super.loadData());
    if (!this.data.maxLength) {
      console.log(
        'Card List: maxLength is not set, using default (' +
        defaultMaxLength.toString() +
        ')',
      );
    }
  }

  public async saveData(): Promise<void> {
    await super.saveData(this.data);
  }

  public readonly pruneOmittedFiles = async (): Promise<void> => {
    this.data.recentFiles = this.data.recentFiles.filter(this.shouldAddFile);
    await this.saveData();
  };

  public readonly pruneLength = async (): Promise<void> => {
    const toRemove =
      this.data.recentFiles.length - (this.data.maxLength || defaultMaxLength);
    if (toRemove > 0) {
      this.data.recentFiles.splice(
        this.data.recentFiles.length - toRemove,
        toRemove,
      );
    }
    await this.saveData();
  };

  public readonly shouldAddFile = (file: FilePath): boolean => {
    const patterns: string[] = this.data.omittedPaths.filter(
      (path) => path.length > 0,
    );
    const fileMatchesRegex = (pattern: string): boolean => {
      try {
        return new RegExp(pattern).test(file.path);
      } catch (err) {
        console.error('Card List: Invalid regex pattern: ' + pattern);
        return false;
      }
    };
    return !patterns.some(fileMatchesRegex);
  };

  private readonly initView = async (): Promise<void> => {
    let leaf: WorkspaceLeaf = null;
    for (leaf of this.app.workspace.getLeavesOfType(CardListViewType)) {
      if (leaf.view instanceof CardListView) return;
      // The view instance was created by an older version of the plugin,
      // so clear it and recreate it (so it'll be the new version).
      // This avoids the need to reload Obsidian to update the plugin.
      await leaf.setViewState({ type: 'empty' });
      break;
    }
    (leaf ?? this.app.workspace.getLeftLeaf(false)).setViewState({
      type: CardListViewType,
      active: true,
    });
  };

  private readonly handleRename = async (
    file: TAbstractFile,
    oldPath: string,
  ): Promise<void> => {
    const entry = this.data.recentFiles.find(
      (recentFile) => recentFile.path === oldPath,
    );
    if (entry) {
      entry.path = file.path;
      entry.basename = this.trimExtension(file.name);
      this.view.redraw();
      await this.saveData();
    }
  };

  private readonly handleDelete = async (
    file: TAbstractFile,
  ): Promise<void> => {
    const beforeLen = this.data.recentFiles.length;
    this.data.recentFiles = this.data.recentFiles.filter(
      (recentFile) => recentFile.path !== file.path,
    );

    if (beforeLen !== this.data.recentFiles.length) {
      this.view.redraw();
      await this.saveData();
    }
  };

  // trimExtension can be used to turn a filename into a basename when
  // interacting with a TAbstractFile that does not have a basename property.
  // private readonly trimExtension = (name: string): string => name.split('.')[0];
  // from: https://stackoverflow.com/a/4250408/617864
  private readonly trimExtension = (name: string): string =>
    name.replace(/\.[^/.]+$/, '');
}

class CardListSettingTab extends PluginSettingTab {
  private readonly plugin: RecentFilesPlugin;

  constructor(app: App, plugin: RecentFilesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Card List List' });

    const fragment = document.createDocumentFragment();
    const link = document.createElement('a');
    link.href =
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
    link.text = 'MDN - Regular expressions';
    fragment.append('RegExp patterns to ignore. One pattern per line. See ');
    fragment.append(link);
    fragment.append(' for help.');

    new Setting(containerEl)
      .setName('Omitted pathname patterns')
      .setDesc(fragment)
      .addTextArea((textArea) => {
        textArea.inputEl.setAttr('rows', 6);
        textArea
          .setPlaceholder('^daily/\n\\.png$\nfoobar.*baz')
          .setValue(this.plugin.data.omittedPaths.join('\n'));
        textArea.inputEl.onblur = (e: FocusEvent) => {
          const patterns = (e.target as HTMLInputElement).value;
          this.plugin.data.omittedPaths = patterns.split('\n');
          this.plugin.pruneOmittedFiles();
          this.plugin.view.redraw();
        };
      });

    new Setting(containerEl)
      .setName('List length')
      .setDesc('Maximum number of filenames to keep in the list.')
      .addText((text) => {
        text.inputEl.setAttr('type', 'number');
        text.inputEl.setAttr('placeholder', defaultMaxLength);
        text
          .setValue(this.plugin.data.maxLength?.toString())
          .onChange((value) => {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed <= 0) {
              new Notice('List length must be a positive integer');
              return;
            }
          });
        text.inputEl.onblur = (e: FocusEvent) => {
          const maxfiles = (e.target as HTMLInputElement).value;
          const parsed = parseInt(maxfiles, 10);
          this.plugin.data.maxLength = parsed;
          this.plugin.pruneLength();
          this.plugin.view.redraw();
        };
      });

    new Setting(containerEl)
      .setName('Open note in')
      .setDesc('Open the clicked recent file record in a new tab, split, or window (only works on the desktop app).')
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {
          'tab': 'tab',
          'split': 'split',
          'window': 'window',
        };

        dropdown
          .addOptions(options)
          .setValue(this.plugin.data.openType)
          .onChange(async (value) => {
            this.plugin.data.openType = value;
            await this.plugin.saveData();
            this.display();
          });
      });

      new Setting(containerEl)
      .setName('Datetime field')
      .setDesc('Frontmatter field to show as date')
      .addText((text) => {
        text.inputEl.setAttr('placeholder', 'created_at');
        text
          .setValue(this.plugin.data.datetime_field)
        text.inputEl.onblur = (e: FocusEvent) => {
          const value = (e.target as HTMLInputElement).value;
          this.plugin.data.datetime_field = value;
          this.plugin.view.redraw();
        };
      });
  }
}


const sweepIcon = `
<svg fill="currentColor" stroke="currentColor" version="1.1" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path d="m495.72 1.582c-7.456-3.691-16.421-0.703-20.142 6.694l-136.92 274.08-26.818-13.433c-22.207-11.118-49.277-2.065-60.396 20.083l-6.713 13.405 160.96 80.616 6.713-13.411c11.087-22.143 2.227-49.18-20.083-60.381l-26.823-13.435 136.92-274.08c3.706-7.412 0.703-16.421-6.694-20.141z"/>
  <circle cx="173" cy="497" r="15"/>
  <circle cx="23" cy="407" r="15"/>
  <circle cx="83" cy="437" r="15"/>
  <path d="m113 482h-60c-8.276 0-15-6.724-15-15 0-8.291-6.709-15-15-15s-15 6.709-15 15c0 24.814 20.186 45 45 45h60c8.291 0 15-6.709 15-15s-6.709-15-15-15z"/>
  <path d="m108.64 388.07c-6.563 0.82-11.807 5.845-12.92 12.349-1.113 6.519 2.153 12.993 8.057 15.952l71.675 35.889c12.935 6.475 27.231 9.053 41.177 7.573-1.641 6.65 1.479 13.784 7.852 16.992l67.061 33.589c5.636 2.78 12.169 1.8 16.685-2.197 2.347-2.091 53.436-48.056 83.3-98.718l-161.6-80.94c-36.208 48.109-120.36 59.39-121.28 59.511z"/>
</svg>`;
