import { useState, useEffect } from 'react';
import { atom, useRecoilState, useSetRecoilState } from 'recoil';
import {
    TFile,
} from 'obsidian';
import * as React from 'react';

const _searchValue = atom({
    key: 'searchValue',
    default: '',
});

const _searchList = atom({
    key: 'searchList',
    default: [{ query: 'test', timestamp: new Date() }],
});

const defaultMaxLength = 50

const CardView = ({ currentFile, plugin }) => {
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
            const content = await plugin.app.vault.cachedRead(markdownFile as TFile)
            setContent(content)
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

export const SearchView = () => {
    const [searchValue, setSearchValue] = useRecoilState(_searchValue);
    const [searchList, setSearchList] = useRecoilState(_searchList);

    function handleClick(e) {
        setSearchValue(e)
    }

    return <div className="oz-folder-pane-horizontal"
        style={{ width: '50%' }}>
        {searchList.map(search =>
            <div onClick={e => handleClick(search.query)} key={search.timestamp}> {search.query} </div>
        )}
    </div>
}


export const CardsView = ({ plugin }) => {

    const [searchValue, setSearchValue] = useRecoilState(_searchValue);
    const [inputValue, setInputValue] = useState('');
    const setSearchList = useSetRecoilState(_searchList);
    const [files, setFiles] = useState([]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setSearchValue(inputValue)
        setSearchList(prev => [...prev, { query: inputValue, timestamp: new Date() }])
    }

    useEffect(() => {

        setInputValue(searchValue)

        let data = [];
        const allFiles = plugin.app.vault.getMarkdownFiles().sort((a, b) => (b.stat.mtime - a.stat.mtime))

        const regex = new RegExp(searchValue)
        
        async function getData() {
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
        }
        getData()
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


export const ReactView = ({ plugin }) => {
    return <div className="file-tree-container-horizontal">
        <SearchView />
        <CardsView plugin={plugin} />
    </div>
};