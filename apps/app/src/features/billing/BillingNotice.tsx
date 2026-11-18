import { Link } from 'react-router-dom';
import notebookImage from '../../../../web/public/lecture-demo/pricing-notebook.webp';
import './billing-support.css';

export function BillingNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="billing-notice" aria-label={title}>
      <div className="billing-notice-heading">
        <h3>{title}</h3>
        <img src={notebookImage} alt="" width={54} height={44} />
      </div>
      <div className="billing-notice-description">{children}</div>
      <Link className="billing-support-link" to="/billing">
        Посмотреть тарифы
      </Link>
    </aside>
  );
}
