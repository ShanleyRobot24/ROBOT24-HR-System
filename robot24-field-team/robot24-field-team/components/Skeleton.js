// Grey outline of a page while it loads for the first time
export default function Skeleton({ rows = 5, cards = 0 }) {
  return (
    <div className="skel" aria-busy="true" aria-label="Loading">
      {cards > 0 && <div className="skel-cards">{Array.from({ length: cards }, (_, i) => <div key={i} className="skel-card" />)}</div>}
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel-row" style={{ width: `${96 - (i % 3) * 9}%` }} />)}
    </div>
  );
}
