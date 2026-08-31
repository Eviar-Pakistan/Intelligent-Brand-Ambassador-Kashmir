import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DemoProvider, RoleProvider } from './context/AppContext'
import { BrandProvider } from './context/BrandContext'
import { DesktopShell } from './components/AppShell'
import { BaShell, ShopperShell } from './components/RoleLayouts'
import { ScreenHub } from './pages/ScreenHub'
import { LoginPage } from './pages/LoginPage'
import { CommandCenterPage, OptimizationPage } from './pages/headOffice/CommandCenterPage'
import { CampaignOverviewPage, CampaignsPage } from './pages/headOffice/CampaignPages'
import {
  AmbassadorProfilePage,
  AmbassadorsPage,
  CandidateDetailPage,
  CandidatesPage,
} from './pages/headOffice/AmbassadorPages'
import { DeploymentPage, StoreDetailPage, StoresPage } from './pages/headOffice/StorePages'
import {
  ConsumersPage,
  LeaderboardPage,
  ReportPage,
  SettingsPage,
} from './pages/headOffice/IntelligencePages'
import { IncentivesPage } from './pages/headOffice/IncentivesPage'
import {
  AttendancePage,
  CoveragePage,
  ManagerDashboard,
} from './pages/manager/ManagerPages'
import {
  BaAssistancePage,
  BaHomePage,
  BaPerformancePage,
  BaTrainingPage,
} from './pages/ba/BaPages'
import {
  ShopperAiPage,
  ShopperFeedbackPage,
  ShopperLandingPage,
  ShopperLearnPage,
  ShopperProductPage,
  ShopperRewardPage,
  ShopperSpinPage,
  ShopperSurveyPage,
} from './pages/shopper/ShopperPages'

const hoPages = (
  <>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<CommandCenterPage />} />
    <Route path="ambassadors" element={<AmbassadorsPage />} />
    <Route path="ambassadors/:id" element={<AmbassadorProfilePage />} />
    <Route path="candidates" element={<CandidatesPage />} />
    <Route path="candidates/:id" element={<CandidateDetailPage />} />
    <Route path="stores" element={<StoresPage />} />
    <Route path="stores/:id" element={<StoreDetailPage />} />
    <Route path="deployment" element={<DeploymentPage />} />
    <Route path="consumers" element={<ConsumersPage />} />
    <Route path="optimization" element={<OptimizationPage />} />
    <Route path="leaderboard" element={<LeaderboardPage />} />
    <Route path="incentives" element={<IncentivesPage />} />
    <Route path="reports" element={<ReportPage />} />
  </>
)

export default function App() {
  return (
    <BrandProvider>
      <RoleProvider>
        <DemoProvider>
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portal" element={<ScreenHub />} />

            {/* Head Office — desktop command center */}
            <Route path="/ho" element={<DesktopShell kind="headOffice" />}>
              {hoPages}
            </Route>

            {/* Administrator — desktop config */}
            <Route path="/admin" element={<DesktopShell kind="admin" />}>
              <Route index element={<Navigate to="settings" replace />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="candidates" element={<CandidatesPage />} />
              <Route path="candidates/:id" element={<CandidateDetailPage />} />
              <Route path="ambassadors" element={<AmbassadorsPage />} />
              <Route path="ambassadors/:id" element={<AmbassadorProfilePage />} />
              <Route path="stores" element={<StoresPage />} />
              <Route path="stores/:id" element={<StoreDetailPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="campaigns/:id" element={<CampaignOverviewPage />} />
            </Route>

            {/* Store Manager — desktop field ops */}
            <Route path="/manager" element={<DesktopShell kind="storeManager" />}>
              <Route index element={<ManagerDashboard />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="coverage" element={<CoveragePage />} />
              <Route path="deployment" element={<DeploymentPage />} />
              <Route path="stores/:id" element={<StoreDetailPage />} />
            </Route>

            {/* Brand Ambassador — full-screen mobile app */}
            <Route path="/ba" element={<BaShell />}>
              <Route index element={<Navigate to="home" replace />} />
              <Route path="home" element={<BaHomePage />} />
              <Route path="training" element={<BaTrainingPage />} />
              <Route path="assistance" element={<BaAssistancePage />} />
              <Route path="performance" element={<BaPerformancePage />} />
            </Route>

            {/* Shopper — full-screen mobile web */}
            <Route path="/shopper" element={<ShopperShell />}>
              <Route index element={<ShopperLandingPage />} />
              <Route path="product" element={<ShopperProductPage />} />
              <Route path="learn" element={<ShopperLearnPage />} />
              <Route path="spin" element={<ShopperSpinPage />} />
              <Route path="ai" element={<ShopperAiPage />} />
              <Route path="survey" element={<ShopperSurveyPage />} />
              <Route path="reward" element={<ShopperRewardPage />} />
              <Route path="feedback" element={<ShopperFeedbackPage />} />
            </Route>

            <Route path="/app/*" element={<Navigate to="/ho/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        </DemoProvider>
      </RoleProvider>
    </BrandProvider>
  )
}
