import "./HttpRequest.css"
import {invoke} from "@tauri-apps/api/core";
import {useState} from "react";

function HttpRequest() {

    const [response, setResponse] = useState("");
    const [url, setUrl] = useState("");
    const [body, setBody] = useState("");
    const [httpMethod, setHttpMethod] = useState("GET");
    const rowLength: number = 20;
    const colLength: number = 80;

    async function invokeHttpRequest() {
        setResponse(await invoke("invoke_http_request", {httpMethod, url, body}));
    }

    return <>
        <div>
            <select id="method" value={httpMethod} onChange={(e) => setHttpMethod(e.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
            </select>
            <input type="url" id="address" value={url} onChange={(e) => setUrl(e.target.value)}/>
            <button type="submit" onClick={invokeHttpRequest}>Submit</button>
            <table>
                <tbody>
                <tr>
                    <th>Output</th>
                    <th>POST/PUT Data</th>
                </tr>
                <tr>
                    <td>
                        <textarea rows={rowLength} cols={colLength} id="console" value={response} readOnly></textarea>
                    </td>
                    <td>
                        <textarea rows={rowLength} cols={colLength} id="dataconsole" value={body}
                                  onChange={(e) => setBody(e.target.value)}></textarea>
                    </td>
                </tr>
                </tbody>
            </table>
        </div>
    </>;
}

export default HttpRequest;