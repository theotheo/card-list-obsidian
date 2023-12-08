import {
    getIcon,
    TFile,
} from 'obsidian';
import { useEffect, useRef, useState } from 'react';
import * as React from 'react';
import { atom, useRecoilState, useSetRecoilState } from 'recoil';

const _searchValue = atom({
    key: 'searchValue',
    default: '',
});

const _searchList = atom({
    key: 'searchList',
    default: [{ query: 'test', timestamp: new Date() }],
});

const defaultMaxLength = 50

const CardView = ({ currentFile, plugin }): React.JSX.Element => {
    let textSnippet = ''
    let date;
    let tags;
    let imgSrc;
    let metadata;
    const [content, setContent] = useState('')

    const markdownFilePath = currentFile.path
    const markdownFile = plugin.app.vault.getAbstractFileByPath(markdownFilePath)

    try {
        metadata = plugin.app.metadataCache.getFileCache(markdownFile as TFile)

    } catch (error) {
        console.log(error)
    }

    const imageUrl = /(jpe?g|png)/;
    const imgs = metadata.embeds?.filter(e => e.link.match(imageUrl))

    if (imgs?.length > 0) {
        const imgLink = imgs[0].link
        const imgFullPath = plugin.app.metadataCache.getFirstLinkpathDest(imgLink, markdownFilePath)
        try {
            imgSrc = plugin.app.vault.getResourcePath(imgFullPath)
        } catch (error) {
            console.log(error)
            console.log(imgs[0])
        }
    }


    if (metadata?.frontmatter) {
        const created_at = moment(metadata.frontmatter[plugin.data.datetime_field])
        date = created_at.format('MMM DD')
        tags = metadata.frontmatter.tags?.reduce((result: string, tag: string) => `${result} #${tag}`, '')
    }

    if (content) {
        if (metadata?.frontmatter) {
            const withoutFrontmatter = content.split('---', 3)[2]
            textSnippet = withoutFrontmatter.substring(0, 265);
        }
        else {
            textSnippet = content.substring(0, 265);
        }
    }

    useEffect(() => {
        (async () => {
            const fileContent = await plugin.app.vault.cachedRead(markdownFile as TFile)
            setContent(fileContent)
        })()
    }, [])


    return <div className="card-container nav-file card-list-file" onClick={event => plugin.focusFile(currentFile, event.ctrlKey || event.metaKey)}>
        <div className="text-container">
            <h4 className="card-list-title">{currentFile.name}</h4>
            <p className='text-snippet'>{textSnippet}</p>
            <div className='details'>
                <p className='date'>{date}</p>
                <p className='tags'>{tags}</p>
            </div>
        </div>
        {imgSrc &&
            <div className='image-container'>
                <img src={imgSrc} alt={currentFile.basename} />
            </div>
        }
    </div>
}

export const SearchView = (): React.JSX.Element => {
    const [searchValue, setSearchValue] = useRecoilState(_searchValue);
    const [searchList, setSearchList] = useRecoilState(_searchList);

    const removeFile = async (query: string): Promise<void> => {
        const newSearchList = searchList.filter(
            (search) => search.query !== query
        );
        setSearchList(newSearchList)
    }
    const icon = getIcon('lucide-x')
    console.log(icon.outerHTML);


    return <div>
        {searchList.map(search =>
            <div key={search.timestamp.toISOString()} className='tree-item-self nav-file-title card-list-title'>
                <div onClick={e => setSearchValue(search.query)} style={{width: '100%'}} className='is-clickable '>{search.query}</div>
                <div className='recent-files-file-delete menu-item-icon' onClick={() => removeFile(search.query)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="svg-icon lucide-x"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
            </div>
        )}
    </div>
}


export const CardsView = ({ plugin }): React.JSX.Element => {

    const [searchValue, setSearchValue] = useRecoilState(_searchValue);
    const [inputValue, setInputValue] = useState('');
    const setSearchList = useSetRecoilState(_searchList);
    const [files, setFiles] = useState([]);

    const handleSubmit = (e): void => {
        e.preventDefault();
        setSearchValue(inputValue)
        setSearchList(prev => [...prev, { query: inputValue, timestamp: new Date() }])
    }

    useEffect(() => {

        setInputValue(searchValue)

        let data = [];
        const allFiles = plugin.app.vault.getMarkdownFiles().sort((a, b) => (b.stat.mtime - a.stat.mtime))

        const regex = new RegExp(searchValue);

        (async () => {
            if (searchValue.length > 0) {
                let index = 0

                for (const file of allFiles) {
                    const contents = await plugin.app.vault.cachedRead(file);
                    if (contents.match(regex)) {
                        data.push(file)
                        index += 1;
                    }
                    if (index > (plugin.data.maxLength || defaultMaxLength)) break;
                }

            } else {
                data = allFiles.slice(0, plugin.data.maxLength || defaultMaxLength)
            }
            setFiles(data)
        })()
    }, [searchValue])


    return <div className="oz-file-list-pane-horizontal nav-folder mod-root">
        <form method="post" onSubmit={handleSubmit}>
            <input type='text' placeholder="поиск" onChange={e => setInputValue(e.target.value)} value={inputValue} />
        </form>
        <div className="nav-folder-children">
            {files.map(currentFile =>
                <CardView currentFile={currentFile} plugin={plugin} key={currentFile.path} />
            )}
        </div>
    </div>

}


export const ReactView = ({ plugin }): React.JSX.Element => {

    const [dividerOnMove, setDividerOnMove] = useState<boolean>(false);
    const [folderPaneWidth, setFolderPaneWidth] = useState<number>(null);
    const [clientX, setClientX] = useState<number>(null);

    const folderPaneRef = useRef<HTMLDivElement>();
    const dividerRef = useRef<HTMLDivElement>();

    const widthSetting = localStorage.getItem(plugin.keys.customWidthKey);

    useEffect(() => {
        if (folderPaneWidth) {
            localStorage.setItem(plugin.keys.customWidthKey, folderPaneWidth.toString());
        }
    }, [folderPaneWidth]);

    const touchMouseStart = (e: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
        e.preventDefault();
        setDividerOnMove(true);
        const width = dividerRef.current.offsetLeft - folderPaneRef.current.offsetLeft;
        setFolderPaneWidth(width);
        setClientX(e.nativeEvent.clientX);
    }

    const touchMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>): VoidFunction => {
        e.preventDefault();
        if (!dividerOnMove) return;
        setFolderPaneWidth(folderPaneWidth + (e.nativeEvent.clientX - clientX));
        setClientX(e.nativeEvent.clientX);
    }

    const touchMouseEnd = (e: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
        e.preventDefault();
        setDividerOnMove(false);
        setClientX(e.nativeEvent.clientX);
    }

    return <div className="file-tree-container-horizontal" onMouseMove={(e) => touchMouseMove(e)} onMouseUp={(e) => touchMouseEnd(e)}>

        <div
            className="oz-folder-pane-horizontal"
            ref={folderPaneRef}
            style={{ width: folderPaneWidth ? `${folderPaneWidth}px` : widthSetting && widthSetting !== '' ? `${widthSetting}px` : '50%' }}>
            <SearchView />
        </div>

        <div
            id="file-tree-divider-horizontal"
            ref={dividerRef}
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => touchMouseStart(e)}
            className={dividerOnMove ? 'active-divider' : ''}></div>

        <CardsView plugin={plugin} />
    </div>
}