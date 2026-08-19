export default function UpdatedBadge({ date }: { date: string }) {
  return (
    <span className="updated-badge" data-testid="updated-badge">
      Updated {date}
    </span>
  );
}
