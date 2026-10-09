export function Equalizer({ paused }: { paused?: boolean }) {
  return (
    <span className={`equalizer ${paused ? 'equalizer--paused' : ''}`} aria-label="재생 중">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
