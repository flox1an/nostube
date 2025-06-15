import { Header } from "@/components/Header";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAppContext } from "@/hooks/useAppContext";

export function MainLayout() {
  const { isSidebarOpen } = useAppContext();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        {isSidebarOpen && (
          <div className="w-64 flex-shrink-0">
            <Sidebar />
          </div>
        )}
        <main className="flex-1 bg-background overflow-auto">
          {/*          <DisclaimerBanner />*/}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
