import './Sidebar.css';

const Sidebar = () => {
    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <h3>Collections</h3>
            </div>
            <ul className="sidebar__list">
                {/* Placeholder for collections */}
                <li className="sidebar__list-item">My Collection</li>
            </ul>
            <div className="sidebar__header">
                <h3>History</h3>
            </div>
            <ul className="sidebar__list">
                {/* Placeholder for history */}
                <li className="sidebar__list-item">GET https://api.example.com</li>
            </ul>
        </aside>
    );
};

export default Sidebar;
