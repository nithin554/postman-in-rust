import React from 'react';
import KeyValuePair, { Entry } from '../shared/KeyValuePair';
import './RequestEditor.css';

type ParamsEditorProps = {
  params: Entry[];
  setParams: React.Dispatch<React.SetStateAction<Entry[]>>;
};

const ParamsEditor = ({ params, setParams }: ParamsEditorProps) => {
  return (
    <div className="request-editor__tab-content">
      <KeyValuePair entries={params} setEntries={setParams} />
    </div>
  );
};

export default ParamsEditor;
