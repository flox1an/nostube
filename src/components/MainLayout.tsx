import { Header } from '@/components/Header';
import { Outlet } from 'react-router-dom';
import { DisclaimerBanner } from './DisclaimerBanner';

export function MainLayout() {
  return (
    <div className="min-h-screen">
      <Header />
      <DisclaimerBanner />
      <main className="bg-background">
        <Outlet />
      </main>
    </div>
  );
}