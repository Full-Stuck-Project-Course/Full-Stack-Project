import { Car } from 'lucide-react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface WelcomeScreenProps {
  onLogin: () => void;
  onSignUp: () => void;
}

export function WelcomeScreen({ onLogin, onSignUp }: WelcomeScreenProps) {
  const { t, direction } = useLanguage();

  return (
    <div className="h-full w-full bg-gradient-to-br from-[#0A84FF] to-blue-600 flex flex-col lg:items-center lg:justify-center" dir={direction}>
      {/* Language Switcher */}
      <div className={`absolute top-14 lg:top-8 ${direction === 'rtl' ? 'left-4 lg:left-8' : 'right-4 lg:right-8'} z-10`}>
        <LanguageSwitcher />
      </div>

      {/* Logo and Tagline */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 lg:flex-none lg:mb-12">
        <div className="w-24 h-24 lg:w-32 lg:h-32 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-xl">
          <Car className="w-12 h-12 lg:w-16 lg:h-16 text-[#0A84FF]" />
        </div>

        <h1 className="text-white text-3xl lg:text-6xl text-center mb-3 lg:mb-4">RideNow</h1>
        <p className="text-blue-100 text-center text-lg lg:text-2xl">{t('welcome.tagline')}</p>
      </div>

      {/* Actions */}
      <div className="p-8 space-y-4 lg:w-full lg:max-w-md">
        <button
          onClick={onLogin}
          className="w-full bg-white text-[#0A84FF] py-4 lg:py-5 rounded-xl shadow-lg hover:bg-gray-50 transition text-lg lg:text-xl font-medium"
        >
          {t('login.button')}
        </button>

        <div className="text-center">
          <span className="text-white text-sm lg:text-base">{t('login.noAccount')} </span>
          <button
            onClick={onSignUp}
            className="text-white text-sm lg:text-base font-medium underline"
          >
            {t('login.signupLink')}
          </button>
        </div>
      </div>
    </div>
  );
}
