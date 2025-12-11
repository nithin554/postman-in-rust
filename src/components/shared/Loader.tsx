import {ClipLoader} from 'react-spinners';
import './Loader.css';

type LoaderProps = {
    elapsedTime: number;
};

const Loader = ({elapsedTime}: LoaderProps) => {
    return (
        <div className="loader-container">
            <ClipLoader color="var(--accent-color)" size={40}/>
            <p>Requesting...</p>
            <p className="timer">{(elapsedTime / 1000).toFixed(2)}s</p>
        </div>
    );
};

export default Loader;
