import {useState} from 'react';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {vscDarkPlus} from 'react-syntax-highlighter/dist/esm/styles/prism';
import Loader from '../shared/Loader';
import './ResponseViewer.css';

type ApiResponse = {
    status: number;
    body: string;
    headers: { key: string; value: string; enabled: boolean }[];
    time: number; // Time in milliseconds
};

type ResponseViewerProps = {
    response: ApiResponse | null;
    error: string | null;
    loading: boolean;
    elapsedTime: number;
};

const ResponseViewer = ({response, error, loading, elapsedTime}: ResponseViewerProps) => {
    const [copyText, setCopyText] = useState('Copy');

    const handleCopy = (textToCopy: string) => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopyText('Copied!');
            setTimeout(() => setCopyText('Copy'), 2000);
        });
    };

    if (loading) {
        return <Loader elapsedTime={elapsedTime}/>;
    }

    const responseBody = response ? response.body : "";
    let formattedBody: string;

    try {
        const parsed = JSON.parse(responseBody);
        formattedBody = JSON.stringify(parsed, null, 2);
    } catch (e) {
        formattedBody = responseBody;
    }

    const displayText = error ? error : formattedBody;

    return (
        <div className="response-viewer">
            <div className="response-viewer__header">
                <h3>Response</h3>
                <div className="response-viewer__meta">
                    {response && response.status ? (
                        <span>Status: <span
                            className={response.status >= 400 ? 'status-error' : 'status-ok'}>{response.status}</span></span>
                    ) : (<span/>)}
                    {response && response.time ? (<span>Time: <span>{response.time} ms</span></span>) : (<span/>)}
                    <button onClick={() => handleCopy(displayText)}>
                        {copyText}
                    </button>
                </div>
            </div>
            <div className="response-viewer__body">
                <SyntaxHighlighter
                    language="json"
                    style={vscDarkPlus}
                    wrapLongLines={true}
                    customStyle={{margin: 0, padding: '1rem'}}
                    codeTagProps={{style: {whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}}
                >
                    {displayText}
                </SyntaxHighlighter>
            </div>
        </div>
    );
};

export default ResponseViewer;
