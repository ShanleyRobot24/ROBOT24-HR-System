// Robbie's head. mood: 'idle' | 'thinking' | 'happy'
export default function RobotHead({ size = 40, mood = 'idle' }) {
  return (
    <svg className={`robbie robbie-${mood}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="5" x2="32" y2="14" stroke="#cddcf0" strokeWidth="3" strokeLinecap="round" />
      <circle className="robbie-light" cx="32" cy="6" r="4.5" fill="#6f9be0" />
      <rect x="6" y="26" width="6" height="14" rx="3" fill="#b7cde9" />
      <rect x="52" y="26" width="6" height="14" rx="3" fill="#b7cde9" />
      <rect x="10" y="13" width="44" height="40" rx="13" fill="#ffffff" stroke="#b7cde9" strokeWidth="2" />
      <rect x="15" y="20" width="34" height="22" rx="9" fill="#0f1d44" />
      <g className="robbie-eyes">
        <ellipse cx="25" cy="30" rx="4" ry="4.5" fill="#8fd3ff" />
        <ellipse cx="39" cy="30" rx="4" ry="4.5" fill="#8fd3ff" />
        <circle cx="26.3" cy="28.6" r="1.3" fill="#ffffff" />
        <circle cx="40.3" cy="28.6" r="1.3" fill="#ffffff" />
      </g>
      <path className="robbie-mouth" d="M26 46 Q32 50.5 38 46" fill="none" stroke="#1f3f8f" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17" cy="45" r="2.2" fill="#f4b6c2" opacity=".8" />
      <circle cx="47" cy="45" r="2.2" fill="#f4b6c2" opacity=".8" />
    </svg>
  );
}
