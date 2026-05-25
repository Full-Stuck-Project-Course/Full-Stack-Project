import { Globe, Bell, Shield, CreditCard, Car, ChevronRight, User } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface SettingsScreenProps {
  mode: 'passenger' | 'driver';
}

interface EmergencyContact {
  name: string;
  phone: string;
}

export function SettingsScreen({ mode }: SettingsScreenProps) {
  const { t, direction, language, setLanguage } = useLanguage();
  const [notifications, setNotifications] = useState(true);
  const [showCarModal, setShowCarModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [editingContact, setEditingContact] = useState<'primary' | 'secondary' | null>(null);
  const [primaryContact, setPrimaryContact] = useState<EmergencyContact>({ name: '', phone: '' });
  const [secondaryContact, setSecondaryContact] = useState<EmergencyContact>({ name: '', phone: '' });
  const [tempContact, setTempContact] = useState<EmergencyContact>({ name: '', phone: '' });

  return (
    <div className="h-full w-full bg-gray-50 overflow-auto pb-20 lg:pb-0" dir={direction}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0A84FF] to-blue-600 pt-14 pb-8 px-6 lg:pt-8">
        <div className={`flex items-center justify-between mb-4 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
          <h2 className="text-white">{t('settings.title')}</h2>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="p-6 space-y-6 lg:max-w-4xl lg:mx-auto lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        {/* Language Preference */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <Globe className="w-5 h-5 text-gray-600" />
              <span className="font-medium">{t('settings.language')}</span>
            </div>
          </div>

          <div className="p-4 space-y-2">
            <button
              onClick={() => setLanguage('en')}
              className={`w-full p-3 rounded-xl flex items-center justify-between transition ${
                language === 'en' ? 'bg-[#0A84FF]/10 border-2 border-[#0A84FF]' : 'bg-gray-50'
              } ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
            >
              <span>English</span>
              {language === 'en' && <div className="w-2 h-2 bg-[#0A84FF] rounded-full" />}
            </button>

            <button
              onClick={() => setLanguage('he')}
              className={`w-full p-3 rounded-xl flex items-center justify-between transition ${
                language === 'he' ? 'bg-[#0A84FF]/10 border-2 border-[#0A84FF]' : 'bg-gray-50'
              } ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
            >
              <span>עברית (Hebrew)</span>
              {language === 'he' && <div className="w-2 h-2 bg-[#0A84FF] rounded-full" />}
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className={`w-full p-4 flex items-center justify-between ${
            direction === 'rtl' ? 'flex-row-reverse' : ''
          }`}>
            <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="font-medium">{t('settings.notifications')}</span>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`w-14 h-8 rounded-full transition-all relative ${
                notifications ? 'bg-[#34C759]' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-transform ${
                  notifications
                    ? direction === 'rtl'
                      ? '-translate-x-7'
                      : 'translate-x-7'
                    : direction === 'rtl'
                    ? '-translate-x-1'
                    : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Ride Preferences */}
        {mode === 'passenger' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <Car className="w-5 h-5 text-gray-600" />
                <span className="font-medium">{t('settings.ridePreferences')}</span>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
                direction === 'rtl' ? 'flex-row-reverse' : ''
              }`}>
                <span className="text-sm">{t('settings.preferredVehicle')}</span>
                <div className={`flex items-center gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <span className="text-sm text-gray-600">{t('home.economy')}</span>
                  <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
                direction === 'rtl' ? 'flex-row-reverse' : ''
              }`}>
                <span className="text-sm">{t('settings.languagePreference')}</span>
                <div className={`flex items-center gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <span className="text-sm text-gray-600">{t('filter.both')}</span>
                  <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Driver Settings */}
        {mode === 'driver' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <Car className="w-5 h-5 text-gray-600" />
                <span className="font-medium">{t('settings.vehicleSettings')}</span>
              </div>
            </div>

            <div className="p-4">
              <div className="bg-gray-50 rounded-xl p-4 mb-3">
                <div className={`flex items-center justify-between mb-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <div className={direction === 'rtl' ? 'text-right' : ''}>
                    <div className="font-medium">Toyota Camry</div>
                    <div className="text-sm text-gray-600">ABC-1234 • {t('home.economy')}</div>
                  </div>
                  <div className="text-3xl">🚗</div>
                </div>
                <div className={`flex gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <button className="flex-1 py-2 bg-white rounded-lg text-sm hover:bg-gray-100 transition">
                    {t('settings.editVehicle')}
                  </button>
                  <button className="flex-1 py-2 bg-white rounded-lg text-sm hover:bg-gray-100 transition">
                    {t('settings.documents')}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setShowCarModal(true)}
                className="w-full py-3 bg-[#0A84FF] text-white rounded-xl hover:bg-[#0A84FF]/90 transition"
              >
                {t('settings.addVehicle')}
              </button>
            </div>
          </div>
        )}

        {/* Account */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <User className="w-5 h-5 text-gray-600" />
              <span className="font-medium">{t('settings.account')}</span>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
              direction === 'rtl' ? 'flex-row-reverse' : ''
            }`}>
              <span className="text-sm">{t('settings.editProfile')}</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            </button>

            <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
              direction === 'rtl' ? 'flex-row-reverse' : ''
            }`}>
              <span className="text-sm">{t('settings.privacy')}</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            </button>

            <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
              direction === 'rtl' ? 'flex-row-reverse' : ''
            }`}>
              <span className="text-sm">{t('settings.payment')}</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Emergency Contacts */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <Shield className="w-5 h-5 text-gray-600" />
              <span className="font-medium">{t('settings.emergency')}</span>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {/* Primary Contact */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className={`flex items-center justify-between mb-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <span className="text-sm font-medium">{t('settings.primaryContact')}</span>
                <button
                  onClick={() => {
                    setEditingContact('primary');
                    setTempContact(primaryContact);
                    setShowEmergencyModal(true);
                  }}
                  className="text-sm text-[#0A84FF]"
                >
                  {primaryContact.name ? t('common.edit') : t('common.add')}
                </button>
              </div>
              {primaryContact.name ? (
                <div className={direction === 'rtl' ? 'text-right' : ''}>
                  <div className="font-medium">{primaryContact.name}</div>
                  <div className="text-sm text-gray-600">{primaryContact.phone}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">{t('settings.addContact')}</div>
              )}
            </div>

            {/* Secondary Contact */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className={`flex items-center justify-between mb-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <span className="text-sm font-medium">{t('settings.secondaryContact')}</span>
                <button
                  onClick={() => {
                    setEditingContact('secondary');
                    setTempContact(secondaryContact);
                    setShowEmergencyModal(true);
                  }}
                  className="text-sm text-[#0A84FF]"
                >
                  {secondaryContact.name ? t('common.edit') : t('common.add')}
                </button>
              </div>
              {secondaryContact.name ? (
                <div className={direction === 'rtl' ? 'text-right' : ''}>
                  <div className="font-medium">{secondaryContact.name}</div>
                  <div className="text-sm text-gray-600">{secondaryContact.phone}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">{t('settings.addContact')}</div>
              )}
            </div>
          </div>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
            direction === 'rtl' ? 'flex-row-reverse' : ''
          }`}>
            <span className="text-sm">{t('settings.help')}</span>
            <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>

          <div className="border-t border-gray-100">
            <button className={`w-full p-4 flex items-center justify-between hover:bg-gray-50 transition ${
              direction === 'rtl' ? 'flex-row-reverse' : ''
            }`}>
              <span className="text-sm">{t('settings.terms')}</span>
              <ChevronRight className={`w-4 h-4 text-gray-400 ${direction === 'rtl' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="border-t border-gray-100">
            <div className="p-4 text-center">
              <div className="text-xs text-gray-500">{t('settings.version')} 1.0.0</div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Car Modal */}
      {showCarModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" onClick={() => setShowCarModal(false)}>
          <div
            className="bg-white rounded-t-3xl w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            dir={direction}
          >
            <h3 className="mb-4">{t('settings.addVehicleTitle')}</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className={`text-sm text-gray-600 ${direction === 'rtl' ? 'text-right block' : ''}`}>
                  {t('settings.carModel')}
                </label>
                <input
                  type="text"
                  placeholder={t('settings.carModelPlaceholder')}
                  className={`w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF] ${
                    direction === 'rtl' ? 'text-right' : ''
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className={`text-sm text-gray-600 ${direction === 'rtl' ? 'text-right block' : ''}`}>
                  {t('settings.licensePlate')}
                </label>
                <input
                  type="text"
                  placeholder="ABC-1234"
                  className={`w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF] ${
                    direction === 'rtl' ? 'text-right' : ''
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className={`text-sm text-gray-600 ${direction === 'rtl' ? 'text-right block' : ''}`}>
                  {t('settings.vehicleType')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['economy', 'premium', 'xl'].map((type) => (
                    <button
                      key={type}
                      className="py-3 bg-gray-100 rounded-xl hover:bg-[#0A84FF] hover:text-white transition"
                    >
                      {t(`home.${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCarModal(false)}
                  className="flex-1 py-3 bg-gray-100 rounded-xl text-gray-700 hover:bg-gray-200 transition"
                >
                  {t('saved.cancel')}
                </button>
                <button
                  onClick={() => setShowCarModal(false)}
                  className="flex-1 py-3 bg-[#0A84FF] text-white rounded-xl hover:bg-[#0A84FF]/90 transition"
                >
                  {t('settings.addVehicleTitle')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Contact Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" onClick={() => setShowEmergencyModal(false)}>
          <div
            className="bg-white rounded-t-3xl w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            dir={direction}
          >
            <h3 className="mb-4">{t('settings.editContact')}</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className={`text-sm text-gray-600 ${direction === 'rtl' ? 'text-right block' : ''}`}>
                  {t('settings.contactName')}
                </label>
                <input
                  type="text"
                  value={tempContact.name}
                  onChange={(e) => setTempContact({ ...tempContact, name: e.target.value })}
                  placeholder="John Doe"
                  className={`w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF] ${
                    direction === 'rtl' ? 'text-right' : ''
                  }`}
                />
              </div>

              <div className="space-y-2">
                <label className={`text-sm text-gray-600 ${direction === 'rtl' ? 'text-right block' : ''}`}>
                  {t('settings.contactPhone')}
                </label>
                <input
                  type="tel"
                  value={tempContact.phone}
                  onChange={(e) => setTempContact({ ...tempContact, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  className={`w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-[#0A84FF] ${
                    direction === 'rtl' ? 'text-right' : ''
                  }`}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEmergencyModal(false)}
                  className="flex-1 py-3 bg-gray-100 rounded-xl text-gray-700 hover:bg-gray-200 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (editingContact === 'primary') {
                      setPrimaryContact(tempContact);
                    } else {
                      setSecondaryContact(tempContact);
                    }
                    setShowEmergencyModal(false);
                  }}
                  className="flex-1 py-3 bg-[#0A84FF] text-white rounded-xl hover:bg-[#0A84FF]/90 transition"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
