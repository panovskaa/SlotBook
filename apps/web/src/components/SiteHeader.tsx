import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { ExpandingLink } from './ui/expanding-link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="wordmark">
          SlotBook
        </Link>
        <ExpandingLink to="/#times" label="Book a session" icon={<Icon name="calendarPlus" size={18} />} />
      </div>
    </header>
  );
}
