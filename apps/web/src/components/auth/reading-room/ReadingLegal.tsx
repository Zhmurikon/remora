import Link from 'next/link';

export function ReadingLegal() {
  return (
    <p className="reading-legal">
      Продолжая, вы принимаете <Link href="/terms">условия использования</Link> и{' '}
      <Link href="/privacy">политику конфиденциальности</Link>.
    </p>
  );
}
