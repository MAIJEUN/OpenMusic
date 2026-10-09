import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { ArtistRef } from '../../shared/types';

export function ArtistLinks({ artists, onNavigate }: { artists?: ArtistRef[]; onNavigate?: () => void }) {
  if (!artists?.length) return null;
  return (
    <>
      {artists.map((a, i) => (
        <Fragment key={`${a.name}${i}`}>
          {i > 0 && ', '}
          {a.id ? (
            <Link to={`/channel/${a.id}`} className="link" onClick={(e) => { e.stopPropagation(); onNavigate?.(); }}>
              {a.name}
            </Link>
          ) : (
            <span>{a.name}</span>
          )}
        </Fragment>
      ))}
    </>
  );
}
