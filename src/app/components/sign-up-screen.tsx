import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface SignUpScreenProps {
  onSignUp: (role: 'passenger' | 'driver' | 'both') => void;
  onBack: () => void;
  onLoginClick: () => void;
  defaultRole?: 'passenger' | 'driver' | 'both';
}

export function SignUpScreen({ onSignUp, onBack, onLoginClick, defaultRole = 'passenger' }: SignUpScreenProps) {
  const { t, direction } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'passenger' | 'driver' | 'both'>(defaultRole);
  const [passwordError, setPasswordError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password length
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setPasswordError('');
    onSignUp(role);
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-auto lg:items-center lg:justify-center lg:bg-gray-50" dir={direction}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0A84FF] to-blue-600 pt-14 pb-8 px-6 lg:w-full lg:max-w-2xl lg:rounded-t-2xl">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="w-10 h-10 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-white"
          >
            <ArrowLeft className={`w-5 h-5 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
          <LanguageSwitcher />
        </div>
        <h2 className="text-white mb-2">{t('signup.title')}</h2>
        <p className="text-blue-100 text-sm">{t('signup.switchNote')}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-6 lg:w-full lg:max-w-2xl lg:bg-white lg:rounded-b-2xl lg:shadow-xl">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">{t('signup.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
            className="w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF]"
            required
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">{t('signup.email')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
            className="w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF]"
            required
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">{t('signup.password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError('');
            }}
            placeholder="••••••••"
            className={`w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 ${
              passwordError ? 'ring-2 ring-red-500' : 'focus:ring-[#0A84FF]'
            }`}
            required
            minLength={8}
          />
          {passwordError && (
            <p className="text-sm text-red-500">{passwordError}</p>
          )}
          <p className="text-xs text-gray-500">Minimum 8 characters</p>
        </div>

        {/* Role Selection */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">{t('signup.role')}</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setRole('passenger')}
              className={`py-3 rounded-xl transition ${
                role === 'passenger'
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {t('signup.passenger')}
            </button>
            <button
              type="button"
              onClick={() => setRole('driver')}
              className={`py-3 rounded-xl transition ${
                role === 'driver'
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {t('signup.driver')}
            </button>
            <button
              type="button"
              onClick={() => setRole('both')}
              className={`py-3 rounded-xl transition ${
                role === 'both'
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {t('signup.both')}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-[#0A84FF] text-white py-4 rounded-xl hover:bg-[#0A84FF]/90 transition"
        >
          {t('signup.create')}
        </button>

        <div className="text-center">
          <span className="text-gray-600 text-sm">{t('signup.hasAccount')} </span>
          <button
            type="button"
            onClick={onLoginClick}
            className="text-[#0A84FF] text-sm"
          >
            {t('signup.loginLink')}
          </button>
        </div>
      </form>
    </div>
  );
}
