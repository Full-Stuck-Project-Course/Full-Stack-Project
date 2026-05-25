import { useState } from 'react';
import { LanguageProvider, useLanguage } from './context/language-context';
import { HomeScreen } from './components/home-screen';
import { DriverHomeScreen } from './components/driver-home-screen';
import { DriverMatchingScreen } from './components/driver-matching-screen';
import { RideProgressScreen } from './components/ride-progress-screen';
import { RatingScreen } from './components/rating-screen';
import { DriverDashboardScreen } from './components/driver-dashboard-screen';
import { RideHistoryScreen } from './components/ride-history-screen';
import { WelcomeScreen } from './components/welcome-screen';
import { SignUpScreen } from './components/sign-up-screen';
import { LogInScreen } from './components/log-in-screen';
import { DriverOnboardingScreen } from './components/driver-onboarding-screen';
import { ProfileScreen } from './components/profile-screen';
import { RoleSwitcherModal } from './components/role-switcher-modal';
import { BottomNavigation } from './components/bottom-navigation';
import { ActivityScreen } from './components/activity-screen';
import { SavedPlacesScreen } from './components/saved-places-screen';
import { SettingsScreen } from './components/settings-screen';
import { ForgotPasswordScreen } from './components/forgot-password-screen';

type Screen =
  | 'welcome'
  | 'signup'
  | 'login'
  | 'forgot-password'
  | 'driver-onboarding'
  | 'passenger-home'
  | 'driver-home'
  | 'matching'
  | 'progress'
  | 'rating'
  | 'driver-dashboard'
  | 'history'
  | 'profile'
  | 'activity'
  | 'saved'
  | 'settings'
  | 'earnings';

function AppContent() {
  const { direction } = useLanguage();
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'passenger' | 'driver' | 'both'>('passenger');
  const [currentMode, setCurrentMode] = useState<'passenger' | 'driver'>('passenger');
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [signUpDefaultRole, setSignUpDefaultRole] = useState<'passenger' | 'driver' | 'both'>('passenger');
  const [currentTab, setCurrentTab] = useState('home');

  const handleSignUp = (role: 'passenger' | 'driver' | 'both') => {
    setUserRole(role);
    if (role === 'driver' || role === 'both') {
      setCurrentScreen('driver-onboarding');
    } else {
      setIsAuthenticated(true);
      setCurrentMode('passenger');
      setCurrentScreen('passenger-home');
      setCurrentTab('home');
    }
  };

  const handleLogin = (role?: 'passenger' | 'driver') => {
    setIsAuthenticated(true);
    const selectedMode = role || (userRole === 'driver' ? 'driver' : 'passenger');
    setCurrentMode(selectedMode);

    if (selectedMode === 'driver') {
      setCurrentScreen('driver-home');
      setCurrentTab('requests');
    } else {
      setCurrentScreen('passenger-home');
      setCurrentTab('home');
    }
  };

  const handleDriverOnboardingComplete = () => {
    setIsAuthenticated(true);
    const mode = userRole === 'driver' ? 'driver' : 'passenger';
    setCurrentMode(mode);

    if (mode === 'driver') {
      setCurrentScreen('driver-home');
      setCurrentTab('requests');
    } else {
      setCurrentScreen('passenger-home');
      setCurrentTab('home');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentScreen('welcome');
  };

  const handleRoleSwitch = (newRole: 'passenger' | 'driver') => {
    setCurrentMode(newRole);
    if (newRole === 'driver') {
      setCurrentScreen('driver-home');
      setCurrentTab('requests');
    } else {
      setCurrentScreen('passenger-home');
      setCurrentTab('home');
    }
  };

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);

    if (currentMode === 'passenger') {
      if (tab === 'home') setCurrentScreen('passenger-home');
      else if (tab === 'activity') setCurrentScreen('activity');
      else if (tab === 'saved') setCurrentScreen('saved');
      else if (tab === 'profile') setCurrentScreen('profile');
    } else {
      if (tab === 'requests') setCurrentScreen('driver-home');
      else if (tab === 'activity') setCurrentScreen('activity');
      else if (tab === 'earnings') setCurrentScreen('earnings');
      else if (tab === 'profile') setCurrentScreen('profile');
    }
  };

  const renderScreen = () => {
    if (!isAuthenticated) {
      switch (currentScreen) {
        case 'welcome':
          return (
            <WelcomeScreen
              onLogin={() => setCurrentScreen('login')}
              onSignUp={() => setCurrentScreen('signup')}
            />
          );
        case 'signup':
          return (
            <SignUpScreen
              defaultRole={signUpDefaultRole}
              onSignUp={handleSignUp}
              onBack={() => setCurrentScreen('welcome')}
              onLoginClick={() => setCurrentScreen('login')}
            />
          );
        case 'login':
          return (
            <LogInScreen
              onLogin={handleLogin}
              onBack={() => setCurrentScreen('welcome')}
              onSignUpClick={() => setCurrentScreen('signup')}
              onForgotPassword={() => setCurrentScreen('forgot-password')}
              userHasBothRoles={userRole === 'both'}
            />
          );
        case 'forgot-password':
          return (
            <ForgotPasswordScreen
              onBack={() => setCurrentScreen('login')}
            />
          );
        case 'driver-onboarding':
          return (
            <DriverOnboardingScreen
              onComplete={handleDriverOnboardingComplete}
              onBack={() => setCurrentScreen('signup')}
            />
          );
        default:
          return (
            <WelcomeScreen
              onLogin={() => setCurrentScreen('login')}
              onSignUp={() => setCurrentScreen('signup')}
            />
          );
      }
    }

    switch (currentScreen) {
      case 'passenger-home':
        return <HomeScreen onRequestRide={() => setCurrentScreen('matching')} />;
      case 'driver-home':
        return <DriverHomeScreen onAcceptRide={() => setCurrentScreen('progress')} />;
      case 'matching':
        return (
          <DriverMatchingScreen
            onCancel={() => setCurrentScreen('passenger-home')}
            onMatched={() => setCurrentScreen('progress')}
          />
        );
      case 'progress':
        return (
          <RideProgressScreen
            onComplete={() => setCurrentScreen('rating')}
            onCancel={() => {
              if (currentMode === 'driver') {
                setCurrentScreen('driver-home');
                setCurrentTab('requests');
              } else {
                setCurrentScreen('passenger-home');
                setCurrentTab('home');
              }
            }}
            mode={currentMode}
          />
        );
      case 'rating':
        return <RatingScreen onComplete={() => {
          if (currentMode === 'driver') {
            setCurrentScreen('driver-home');
            setCurrentTab('requests');
          } else {
            setCurrentScreen('passenger-home');
            setCurrentTab('home');
          }
        }} />;
      case 'earnings':
        return <DriverDashboardScreen onBack={() => {
          setCurrentScreen('driver-home');
          setCurrentTab('requests');
        }} />;
      case 'activity':
        return <ActivityScreen mode={currentMode} />;
      case 'saved':
        return <SavedPlacesScreen />;
      case 'settings':
        return <SettingsScreen mode={currentMode} />;
      case 'history':
        return <RideHistoryScreen onBack={() => {
          if (currentMode === 'driver') {
            setCurrentScreen('driver-home');
            setCurrentTab('requests');
          } else {
            setCurrentScreen('passenger-home');
            setCurrentTab('home');
          }
        }} />;
      case 'profile':
        return (
          <ProfileScreen
            onBack={() => {
              if (currentMode === 'driver') {
                setCurrentScreen('driver-home');
                setCurrentTab('requests');
              } else {
                setCurrentScreen('passenger-home');
                setCurrentTab('home');
              }
            }}
            onSwitchMode={() => setShowRoleSwitcher(true)}
            onLogout={handleLogout}
            userRole={userRole}
            currentMode={currentMode}
            driverLanguages={['en', 'he']}
            onSettings={() => {
              setCurrentScreen('settings');
              setCurrentTab('profile');
            }}
          />
        );
      default:
        return currentMode === 'driver'
          ? <DriverHomeScreen onAcceptRide={() => setCurrentScreen('progress')} />
          : <HomeScreen onRequestRide={() => setCurrentScreen('matching')} />;
    }
  };

  const showBottomNav = isAuthenticated && !['matching', 'progress', 'rating'].includes(currentScreen);
  const showSideNav = isAuthenticated && !['matching', 'progress', 'rating'].includes(currentScreen);

  return (
    <div className="size-full bg-gray-100">
      {/* Desktop Sidebar Navigation */}
      {showSideNav && (
        <div className="hidden lg:block fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 z-50">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-[#0A84FF] mb-8">RideShare</h1>

            {/* Navigation Links */}
            <nav className="space-y-2">
              {currentMode === 'passenger' ? (
                <>
                  <button
                    onClick={() => handleTabChange('home')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'home' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Home</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('activity')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'activity' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Activity</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('saved')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'saved' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Saved Places</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('profile')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'profile' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Profile</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleTabChange('requests')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'requests' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Requests</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('activity')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'activity' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Activity</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('earnings')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'earnings' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Earnings</span>
                  </button>
                  <button
                    onClick={() => handleTabChange('profile')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                      currentTab === 'profile' ? 'bg-[#0A84FF] text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Profile</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Role Switcher - Desktop */}
          {userRole === 'both' && (
            <div className="absolute bottom-6 left-6 right-6">
              <button
                onClick={() => setShowRoleSwitcher(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className="text-sm font-medium">Switch to {currentMode === 'passenger' ? 'Driver' : 'Passenger'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Role Switcher Modal */}
      {showRoleSwitcher && userRole === 'both' && (
        <RoleSwitcherModal
          currentRole={currentMode}
          onSwitch={handleRoleSwitch}
          onClose={() => setShowRoleSwitcher(false)}
        />
      )}

      {/* Main Content Area */}
      <div className={`${showSideNav ? 'lg:pl-64' : ''} h-full w-full`}>
        {/* Mobile/Tablet View - Keep original design */}
        <div className="lg:hidden relative h-full w-full">
          {/* Mobile Status Bar */}
          <div className="absolute top-0 left-0 right-0 h-14 bg-white z-50 flex items-center justify-between px-8 pt-2 lg:hidden">
            <div className="text-sm">9:41</div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 border border-gray-900 rounded-sm" />
              <div className="w-1 h-3 bg-gray-900 rounded-sm" />
            </div>
          </div>

          {/* Screen Content */}
          <div className="relative h-full w-full overflow-hidden">
            {renderScreen()}
          </div>

          {/* Bottom Navigation - Mobile Only */}
          {showBottomNav && (
            <BottomNavigation
              mode={currentMode}
              currentTab={currentTab}
              onTabChange={handleTabChange}
            />
          )}

          {/* Home Indicator - Mobile Only */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 rounded-full z-50 lg:hidden" />
        </div>

        {/* Desktop View - New responsive design */}
        <div className="hidden lg:block h-full w-full bg-gray-50">
          {renderScreen()}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}