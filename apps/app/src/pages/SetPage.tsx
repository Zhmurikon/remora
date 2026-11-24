import { useParams } from 'react-router-dom';
import { SetDetails } from '../features/materials/SetDetails';

export function SetPage() {
  const { setId = '' } = useParams();
  return <SetDetails key={setId} setId={setId} />;
}
