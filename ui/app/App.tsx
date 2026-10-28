import { PageLayout } from "@dynatrace/strato-components/layouts";
import { ToastContainer } from "@dynatrace/strato-components/notifications";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { AdminOnly } from "./components/AdminOnly";
import { Header } from "./components/Header";
import { CostDataProvider } from "./cost/CostDataContext";
import { Account } from "./pages/Account";
import { Attribution } from "./pages/Attribution";
import { Coverage } from "./pages/Coverage";
import { Overview } from "./pages/Overview";
import { RateCard } from "./pages/RateCard";
import { AppSettingsProvider } from "./settings/AppSettingsContext";

export const App = () => {
  return (
    <AppSettingsProvider>
      <CostDataProvider>
        <PageLayout>
          <PageLayout.Header>
            <Header />
          </PageLayout.Header>
          <PageLayout.Content>
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/attribution" element={<Attribution />} />
              <Route path="/coverage" element={<Coverage />} />
              <Route
                path="/account"
                element={
                  <AdminOnly>
                    <Account />
                  </AdminOnly>
                }
              />
              <Route
                path="/rate-card"
                element={
                  <AdminOnly>
                    <RateCard />
                  </AdminOnly>
                }
              />
            </Routes>
          </PageLayout.Content>
        </PageLayout>
        <ToastContainer />
      </CostDataProvider>
    </AppSettingsProvider>
  );
};
