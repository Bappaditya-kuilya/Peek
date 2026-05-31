export function ActivityFeed({ items }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="section-panel">
      <div className="subtle-list-title activity-feed-title">Recent activity</div>
      <div className="activity-feed">
      {items.slice(0, 5).map((item) => (
        <div className="activity-item" key={item.id}>
          {item.fileName} downloaded {item.when}
        </div>
      ))}
      </div>
    </div>
  );
}
