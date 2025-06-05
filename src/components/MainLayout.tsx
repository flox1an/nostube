import { Header } from '@/components/Header';
import { Outlet } from 'react-router-dom';

export function MainLayout() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="bg-background">
        <Outlet />
      </main>
    </div>
  );
}