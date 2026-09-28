import { StudySession } from '../components/StudySession';

export function Learn() {
  return (
    <div className="page">
      <h1>New words</h1>
      <p className="lede">Most common words first. Read each one, then type it from memory when it comes back.</p>
      <StudySession mode="learn" />
    </div>
  );
}
