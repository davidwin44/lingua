import { useSearchParams } from 'react-router-dom';
import { StudySession } from '../components/StudySession';

export function Review() {
  const [params] = useSearchParams();
  const catchup = params.get('mode') === 'catchup';
  return (
    <div className="page">
      <h1>{catchup ? 'Catch-up' : 'Review'}</h1>
      {catchup ? <p className="lede">The 20 most overdue cards. The rest is spread over the next few days.</p> : null}
      <StudySession key={catchup ? 'catchup' : 'review'} mode={catchup ? 'catchup' : 'review'} />
    </div>
  );
}
