import { createRoot } from 'react-dom/client';
import './styles.css';
import { Tv } from './pages/Tv';
import { Join } from './pages/Join';

const isTv = location.pathname.startsWith('/tv');
document.body.classList.add(isTv ? 'tv' : 'phone');
createRoot(document.getElementById('root')!).render(isTv ? <Tv /> : <Join />);
