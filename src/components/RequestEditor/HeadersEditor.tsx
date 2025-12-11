import React from 'react';
import KeyValuePair, { Entry } from '../shared/KeyValuePair';
import './RequestEditor.css';

type HeadersEditorProps = {
  headers: Entry[];
  setHeaders: React.Dispatch<React.SetStateAction<Entry[]>>;
};

const HeadersEditor = ({ headers, setHeaders }: HeadersEditorProps) => {
  return (
    <div className="request-editor__tab-content">
      <KeyValuePair entries={headers} setEntries={setHeaders} />
    </div>
  );
};

export default HeadersEditor;
