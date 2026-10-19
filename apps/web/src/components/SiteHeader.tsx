import { Link } from 'react-router-dom';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="wordmark">
          SlotBook
        </Link>
        <Link to="/#times" className="button button--primary button--small">
          Book a session
        </Link>
      </div>
    </header>
  );
}
