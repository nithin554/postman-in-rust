import {useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import './RequestEditor.css';
import ParamsEditor from './ParamsEditor';
import HeadersEditor from './HeadersEditor';
import BodyEditor from './BodyEditor';
import {Entry} from '../shared/KeyValuePair';
import {RustApiResponse} from '../../App';

type Tab = 'Params' | 'Headers' | 'Body';

type RequestEditorProps = {
    loading: boolean;
    onStart: () => void;
    onSuccess: (response: RustApiResponse) => void;
    onError: (message: string) => void;
    onCancel: () => void;
};

const RequestEditor = ({loading, onStart, onSuccess, onError, onCancel}: RequestEditorProps) => {
    const [activeTab, setActiveTab] = useState<Tab>('Params');
    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState('');
    const [params, setParams] = useState<Entry[]>([]);
    const [headers, setHeaders] = useState<Entry[]>([]);
    const [body, setBody] = useState('');

    // Use a ref to track if the request was cancelled
    const isCancelled = useRef(false);

    const handleSend = async () => {
        isCancelled.current = false;
        onStart();

        const requestData = {
            method,
            url,
            params: params.filter(p => p.enabled && p.key),
            headers: headers.filter(h => h.enabled && h.key),
            body: body,
        };

        try {
            const res = await invoke<RustApiResponse>("invoke_http_request", {
                requestPayload: requestData
            });
            if (!isCancelled.current) {
                onSuccess(res);
            }
        } catch (err) {
            if (!isCancelled.current) {
                onError(typeof err === 'string' ? err : 'An unknown error occurred.'); // Signal error to App
            }
        }
    };

    const handleCancel = () => {
        isCancelled.current = true;
        onCancel();
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'Params':
                return <ParamsEditor params={params} setParams={setParams}/>;
            case 'Headers':
                return <HeadersEditor headers={headers} setHeaders={setHeaders}/>;
            case 'Body':
                return <BodyEditor body={body} setBody={setBody}/>;
            default:
                return null;
        }
    };

    return (
        <div className="request-editor">
            <div className="request-editor__url-bar">
                <select value={method} onChange={e => setMethod(e.target.value)} disabled={loading}>
                    <option>GET</option>
                    <option>POST</option>
                    <option>PUT</option>
                    <option>DELETE</option>
                </select>
                <input
                    type="text"
                    placeholder="https://api.example.com/data"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    disabled={loading}
                />
                {loading ? (
                    <button onClick={handleCancel} className="cancel-btn">Cancel</button>
                ) : (
                    <button onClick={handleSend}>Send</button>
                )}
            </div>
            <div className="request-editor__tabs">
                <button className={activeTab === 'Params' ? 'active' : ''}
                        onClick={() => setActiveTab('Params')}>Params
                </button>
                <button className={activeTab === 'Headers' ? 'active' : ''}
                        onClick={() => setActiveTab('Headers')}>Headers
                </button>
                <button className={activeTab === 'Body' ? 'active' : ''} onClick={() => setActiveTab('Body')}>Body
                </button>
            </div>
            {renderTabContent()}
        </div>
    );
};

export default RequestEditor;
