import React from 'react';
import './RequestEditor.css';

type BodyEditorProps = {
  body: string;
  setBody: React.Dispatch<React.SetStateAction<string>>;
};

const BodyEditor = ({ body, setBody }: BodyEditorProps) => {
  return (
    <div className="request-editor__tab-content">
      <textarea
        className="body-textarea"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder='{ "key": "value" }'
      />
    </div>
  );
};

export default BodyEditor;
