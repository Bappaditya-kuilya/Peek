export function ActivityFeed({ items }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="panel">
      <div className="section-heading-row">
        <div>
          <div className="panel-label">Activity</div>
          <h2 className="section-title">Recent events</h2>
        </div>
      </div>
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
