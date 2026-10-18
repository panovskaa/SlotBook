import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="narrow">
      <h1 className="page-title">Page not found</h1>
      <p className="lede lede--tight">This page doesn't exist.</p>
      <Link to="/" className="button button--primary">
        See available times
      </Link>
    </div>
  );
}
