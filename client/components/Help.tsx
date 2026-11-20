// How-to-play cheat sheet, shown on phones (? button) and on the TV while paused.

const BASICS: [string, string][] = [
  ['Skate', 'Drag your left thumb anywhere on the left half'],
  ['PASS', 'Top button when you have the puck. Aims at the teammate you’re facing'],
  ['SHOOT', 'Bottom button. Tap for a quick shot, or hold to charge and aim with the stick'],
  ['POKE', 'Top button without the puck. Tap right next to the carrier, facing them, to steal it'],
];

const SKILLS: [string, string][] = [
  ['Perfect shot', 'Release SHOOT while the fill is in the green band. Faster, harder to save'],
  ['One-timer', 'Hold SHOOT before a teammate’s pass reaches you. It fires instantly'],
  ['Clean catch', 'Tap POKE just as a loose puck reaches you (button glows). Speed boost'],
  ['Don’t whiff', 'POKE with nothing nearby makes you stumble and slows your next poke'],
  ['Bumping', 'Running into the carrier slows them down but never steals the puck'],
];

export function HelpSheet({ big = false }: { big?: boolean }) {
  return (
    <div className={`help-sheet ${big ? 'big' : ''}`}>
      <div className="help-col">
        <h3>Controls</h3>
        {BASICS.map(([k, v]) => (
          <p key={k}>
            <b>{k}</b> {v}
          </p>
        ))}
      </div>
      <div className="help-col">
        <h3>Skill moves</h3>
        {SKILLS.map(([k, v]) => (
          <p key={k}>
            <b>{k}</b> {v}
          </p>
        ))}
        <p className="help-note">Carrying the puck makes you a little slower, so pass it around!</p>
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <HelpSheet />
        <button className="btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
