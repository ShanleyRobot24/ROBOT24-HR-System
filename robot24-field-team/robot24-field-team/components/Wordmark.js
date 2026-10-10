// ROBOT24.com wordmark, drawn in text so it stays sharp at any size
export default function Wordmark({ sub = 'Field Team', big = false }) {
  return (
    <span className={`brand ${big ? 'big' : ''}`}>
      <span className="wordmark" aria-label="Robot24.com">ROBOT<span className="n24">24</span><span className="dotcom">.com</span></span>
      {sub && <span className="brand-sub">{sub}</span>}
    </span>
  );
}
