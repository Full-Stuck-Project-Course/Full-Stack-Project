import { MapPin, Clock, Filter } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface HomeScreenProps {
  onRequestRide: () => void;
}

export function HomeScreen({ onRequestRide }: HomeScreenProps) {
  const { t, direction } = useLanguage();
  const [languageFilter, setLanguageFilter] = useState<'en' | 'he' | 'both'>('both');
  const [genderFilter, setGenderFilter] = useState<'male' | 'female' | 'any'>('any');
  const [selectedCarType, setSelectedCarType] = useState<'economy' | 'premium' | 'xl'>('economy');
  const [showFilter, setShowFilter] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<'all' | '4+' | '5'>('all');
  const [isBottomSheetCollapsed, setIsBottomSheetCollapsed] = useState(false);

  return (
    <div className="relative h-full w-full bg-gray-100 lg:flex lg:gap-6 lg:p-6" dir={direction}>
      {/* Language Switcher */}
      <div className={`absolute top-14 z-30 ${direction === 'rtl' ? 'left-4' : 'right-4'}`}>
        <LanguageSwitcher />
      </div>
      {/* Map Background */}
      <div className="absolute inset-0 lg:relative lg:flex-1 lg:rounded-2xl lg:overflow-hidden bg-gradient-to-br from-blue-50 via-gray-100 to-green-50">
        <div className="absolute inset-0 opacity-20">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-gray-300 rounded-full"
              style={{
                width: Math.random() * 40 + 10,
                height: Math.random() * 40 + 10,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Current Location Pin */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="absolute inset-0 bg-[#0A84FF] rounded-full blur-xl opacity-40 animate-pulse" />
          <MapPin className="w-12 h-12 text-[#0A84FF] drop-shadow-lg" fill="#0A84FF" />
        </div>
      </div>

      {/* Top Search Bar / Desktop Sidebar */}
      <div className="absolute top-20 left-0 right-0 px-4 z-20 max-h-[55%] overflow-auto lg:relative lg:top-0 lg:px-0 lg:w-96 lg:max-h-none lg:flex-shrink-0">
        <div className="bg-white rounded-2xl shadow-lg p-4 lg:p-6 lg:h-full lg:overflow-auto">
          <div className={`flex items-center gap-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <div className="w-2 h-2 rounded-full bg-[#0A84FF]" />
            <input
              type="text"
              placeholder={t('home.whereTo')}
              className={`flex-1 outline-none ${direction === 'rtl' ? 'text-right' : ''}`}
            />
          </div>

          {/* Filters */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center gap-2 text-sm text-gray-600 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>

            {showFilter && (
              <div className="mt-3 space-y-3">
                {/* Language Filter */}
                <div>
                  <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                    {t('filter.language')}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['en', 'he', 'both'].map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setLanguageFilter(lang as typeof languageFilter)}
                        className={`px-3 py-1.5 rounded-full text-sm transition ${
                          languageFilter === lang
                            ? 'bg-[#0A84FF] text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {t(`filter.${lang}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gender Filter */}
                <div>
                  <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                    {t('filter.gender')}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['male', 'female', 'any'].map((gender) => (
                      <button
                        key={gender}
                        onClick={() => setGenderFilter(gender as typeof genderFilter)}
                        className={`px-3 py-1.5 rounded-full text-sm transition ${
                          genderFilter === gender
                            ? 'bg-[#0A84FF] text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {t(`filter.${gender}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating Filter */}
                <div>
                  <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                    Driver Rating
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['all', '4+', '5'].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setRatingFilter(rating as typeof ratingFilter)}
                        className={`px-3 py-1.5 rounded-full text-sm transition ${
                          ratingFilter === rating
                            ? 'bg-[#0A84FF] text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {rating === 'all' ? 'All Ratings' : rating === '4+' ? '4+ Stars' : '5 Stars'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Sheet / Desktop Panel */}
      <div
        className="absolute bottom-16 left-0 right-0 lg:hidden bg-white rounded-t-3xl shadow-2xl z-20 transition-all duration-300"
        style={{ maxHeight: isBottomSheetCollapsed ? '80px' : '500px' }}
      >
        <button
          onClick={() => setIsBottomSheetCollapsed(!isBottomSheetCollapsed)}
          className="w-full p-6 pb-2"
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />
        </button>

        <div className={`px-6 ${isBottomSheetCollapsed ? 'hidden' : 'pb-6'}`}>

        <h3 className="mb-4 lg:hidden">{t('home.chooseRide')}</h3>

        {/* Desktop: Ride options shown in sidebar */}
        <div className="hidden lg:block mb-6">
          <h3 className="mb-4">{t('home.chooseRide')}</h3>
        </div>

        <div className="space-y-3 mb-6 lg:mb-4">
          {/* Economy Option */}
          <button
            onClick={() => setSelectedCarType('economy')}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition cursor-pointer ${
              selectedCarType === 'economy'
                ? 'bg-[#0A84FF]/5 border-2 border-[#0A84FF]'
                : 'bg-gray-50 hover:bg-gray-100'
            } ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex items-center gap-4 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                selectedCarType === 'economy' ? 'bg-[#0A84FF]/10' : 'bg-gray-200'
              }`}>
                🚗
              </div>
              <div className={direction === 'rtl' ? 'text-right' : ''}>
                <div className="font-medium">{t('home.economy')}</div>
                <div className={`text-sm text-gray-600 flex items-center gap-1 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <Clock className="w-3 h-3" />
                  2 {t('home.minAway')}
                </div>
              </div>
            </div>
            <div className="font-medium">$12.50</div>
          </button>

          {/* Premium Option */}
          <button
            onClick={() => setSelectedCarType('premium')}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition cursor-pointer ${
              selectedCarType === 'premium'
                ? 'bg-[#0A84FF]/5 border-2 border-[#0A84FF]'
                : 'bg-gray-50 hover:bg-gray-100'
            } ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex items-center gap-4 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                selectedCarType === 'premium' ? 'bg-[#0A84FF]/10' : 'bg-gray-200'
              }`}>
                🚙
              </div>
              <div className={direction === 'rtl' ? 'text-right' : ''}>
                <div className="font-medium">{t('home.premium')}</div>
                <div className={`text-sm text-gray-600 flex items-center gap-1 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <Clock className="w-3 h-3" />
                  3 {t('home.minAway')}
                </div>
              </div>
            </div>
            <div className="font-medium">$18.00</div>
          </button>

          {/* XL Option */}
          <button
            onClick={() => setSelectedCarType('xl')}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition cursor-pointer ${
              selectedCarType === 'xl'
                ? 'bg-[#0A84FF]/5 border-2 border-[#0A84FF]'
                : 'bg-gray-50 hover:bg-gray-100'
            } ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`flex items-center gap-4 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                selectedCarType === 'xl' ? 'bg-[#0A84FF]/10' : 'bg-gray-200'
              }`}>
                🚐
              </div>
              <div className={direction === 'rtl' ? 'text-right' : ''}>
                <div className="font-medium">{t('home.xl')}</div>
                <div className={`text-sm text-gray-600 flex items-center gap-1 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <Clock className="w-3 h-3" />
                  5 {t('home.minAway')}
                </div>
              </div>
            </div>
            <div className="font-medium">$24.00</div>
          </button>
        </div>

          <button
            onClick={onRequestRide}
            className="w-full bg-[#0A84FF] text-white py-4 rounded-xl shadow-lg hover:bg-[#0A84FF]/90 transition"
          >
            {t('home.requestRide')}
          </button>
        </div>
      </div>
    </div>
  );
}
