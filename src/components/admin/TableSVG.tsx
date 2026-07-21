// Composant partagé (FOND identique) — rend une table comme du mobilier :
// un plateau (carré ou rond) entouré de N chaises réparties selon la capacité.
// Utilisé par TabPlan (plan de salle) et PlanService (plan de service).
// Piloté uniquement par capacity + round ; les couleurs viennent des classes
// CSS `.tp-plateau` / `.tp-chaise` (thémées par variables admin, jamais en dur).
// La prop `className` permet à chaque vue d'appliquer ses états (occupée, etc.).

export default function TableSVG({
  size,
  capacity,
  round,
  className,
}: {
  size: number;
  capacity: number;
  round: boolean;
  className?: string;
}) {
  const c = size / 2;
  const chairLong = Math.max(13, size * 0.16);
  const chairShort = chairLong * 0.62;
  const n = Math.max(1, capacity);
  const plateau = round ? size * 0.64 : size * 0.64;
  const chairs: JSX.Element[] = [];

  if (round) {
    const ray = plateau / 2 + chairShort * 0.72;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const cx = c + ray * Math.cos(a);
      const cy = c + ray * Math.sin(a);
      const deg = (a * 180) / Math.PI + 90;
      chairs.push(
        <rect key={i} className="tp-chaise"
          x={cx - chairLong / 2} y={cy - chairShort / 2}
          width={chairLong} height={chairShort} rx={3}
          transform={`rotate(${deg} ${cx} ${cy})`} />
      );
    }
  } else {
    // Répartition par côté : haut, bas, puis gauche/droite pour le surplus.
    const sides = [
      { dx: 0, dy: -1, horiz: true },   // haut
      { dx: 0, dy: 1, horiz: true },    // bas
      { dx: -1, dy: 0, horiz: false },  // gauche
      { dx: 1, dy: 0, horiz: false },   // droite
    ];
    const perSide = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) perSide[i % (n <= 2 ? 2 : 4)]++;
    const off = plateau / 2 + chairShort * 0.72;
    sides.forEach((s, si) => {
      const cnt = perSide[si];
      for (let k = 0; k < cnt; k++) {
        const t = cnt === 1 ? 0.5 : (k + 1) / (cnt + 1);
        const along = (t - 0.5) * plateau;
        const cx = s.horiz ? c + along : c + s.dx * off;
        const cy = s.horiz ? c + s.dy * off : c + along;
        const w = s.horiz ? chairLong : chairShort;
        const h = s.horiz ? chairShort : chairLong;
        chairs.push(
          <rect key={`${si}-${k}`} className="tp-chaise"
            x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={3} />
        );
      }
    });
  }

  return (
    <svg className={`tp-table-svg${className ? " " + className : ""}`}
      viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      {chairs}
      {round
        ? <circle className="tp-plateau" cx={c} cy={c} r={plateau / 2} />
        : <rect className="tp-plateau" x={c - plateau / 2} y={c - plateau / 2} width={plateau} height={plateau} rx={8} />}
    </svg>
  );
}
