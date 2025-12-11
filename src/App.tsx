import {useRef, useState} from 'react';
import './App.css';
import {Panel, PanelGroup, PanelResizeHandle} from 'react-resizable-panels';
import {useInterval} from 'use-interval';
import Sidebar from './components/Sidebar/Sidebar';
import RequestEditor from './components/RequestEditor/RequestEditor';
import ResponseViewer from './components/ResponseViewer/ResponseViewer';
import StatusBar from './components/StatusBar/StatusBar';

export type KeyValuePair = {
    key: string;
    value: string;
    enabled: boolean;
};

export type RustApiResponse = {
    status: number;
    body: string;
    headers: KeyValuePair[];
};

export type ApiResponse = RustApiResponse & {
    time: number;
};

function App() {
    const [loading, setLoading] = useState(false);
    const [showLoaderVisual, setShowLoaderVisual] = useState(false);
    const [response, setResponse] = useState<ApiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);

    const startTimeRef = useRef<number>(0);

    useInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
    }, loading ? 10 : null);

    const handleRequestStart = () => {
        setLoading(true);
        setShowLoaderVisual(true);
        setError(null);
        setResponse(null);
        setElapsedTime(0);
        startTimeRef.current = Date.now();
    };

    const handleRequestSuccess = (rustResponse: RustApiResponse) => {
        const finalTime = Date.now() - startTimeRef.current;
        setResponse({...rustResponse, time: finalTime});
        setElapsedTime(finalTime);
        setLoading(false);
        setShowLoaderVisual(false);
    };

    const handleRequestError = (errorMessage: string) => {
        setError(errorMessage);
        setElapsedTime(Date.now() - startTimeRef.current);
        setLoading(false);
        setShowLoaderVisual(false);
    };

    const handleRequestCancel = () => {
        setLoading(false);
        setShowLoaderVisual(false);
        setError('Request was cancelled by the user.');
    };

    return (
        <>
            <PanelGroup direction="horizontal" className="panel-group">
                <Panel defaultSize={20} minSize={15}>
                    <Sidebar/>
                </Panel>
                <PanelResizeHandle className="panel-resize-handle"/>
                <Panel minSize={30}>
                    <PanelGroup direction="vertical">
                        <Panel defaultSize={40} minSize={20}>
                            <RequestEditor
                                loading={loading}
                                onStart={handleRequestStart}
                                onSuccess={handleRequestSuccess}
                                onError={handleRequestError}
                                onCancel={handleRequestCancel} // Pass the new cancel handler
                            />
                        </Panel>
                        <PanelResizeHandle className="panel-resize-handle"/>
                        <Panel minSize={20}>
                            <ResponseViewer response={response} error={error} loading={showLoaderVisual}
                                            elapsedTime={elapsedTime}/>
                        </Panel>
                    </PanelGroup>
                </Panel>
            </PanelGroup>
            <StatusBar/>
        </>
    );
}

export default App;
