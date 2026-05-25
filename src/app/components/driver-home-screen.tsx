import { MapPin, DollarSign, Star, Clock, Filter, User } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface DriverHomeScreenProps {
  onAcceptRide: () => void;
}

export function DriverHomeScreen({ onAcceptRide }: DriverHomeScreenProps) {
  const { t, direction } = useLanguage();
  const [isOnline, setIsOnline] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<'all' | '5km' | '10km' | '15km'>('all');
  const [languageFilter, setLanguageFilter] = useState<'en' | 'he' | 'both'>('both');
  const [ratingFilter, setRatingFilter] = useState<'all' | '4+' | '5'>('all');
  const [declinedRides, setDeclinedRides] = useState<number[]>([]);

  const rideRequests = [
    {
      id: 1,
      pickup: '123 Main St, Downtown',
      destination: 'Airport Terminal 2',
      fare: '$32.50',
      distance: '2.3 km',
      passengerRating: 4.9,
      language: ['en', 'he'],
    },
    {
      id: 2,
      pickup: '456 Oak Ave, Marina',
      destination: 'Central Station',
      fare: '$18.00',
      distance: '1.5 km',
      passengerRating: 4.7,
      language: ['en'],
    },
    {
      id: 3,
      pickup: '789 Pine Rd, Suburbs',
      destination: 'Shopping Mall',
      fare: '$12.50',
      distance: '3.8 km',
      passengerRating: 5.0,
      language: ['he'],
    },
  ];

  return (
    <div className="relative h-full w-full bg-gray-100 lg:flex lg:gap-6 lg:p-6" dir={direction}>
      {/* Map Background */}
      <div className="absolute inset-0 lg:relative lg:flex-1 lg:rounded-2xl lg:overflow-hidden bg-gradient-to-br from-blue-50 via-gray-100 to-green-50">
        <div className="absolute inset-0 opacity-20">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-gray-300 rounded-full"
              style={{
                width: Math.random() * 30 + 10,
                height: Math.random() * 30 + 10,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Ride Request Markers */}
        {rideRequests.map((request, i) => (
          <div
            key={request.id}
            className="absolute w-8 h-8 bg-[#34C759] rounded-full border-4 border-white shadow-lg flex items-center justify-center animate-pulse"
            style={{
              top: `${25 + i * 20}%`,
              left: `${30 + i * 15}%`,
            }}
          >
            <User className="w-4 h-4 text-white" />
          </div>
        ))}
      </div>

      {/* Top Bar / Desktop Sidebar */}
      <div className="absolute top-0 left-0 right-0 pt-14 px-4 z-20 max-h-[50%] overflow-auto lg:relative lg:top-0 lg:pt-0 lg:px-0 lg:w-96 lg:max-h-none lg:flex-shrink-0">
        <div className="bg-white rounded-2xl shadow-lg p-4 lg:p-6 lg:h-full lg:overflow-auto">
          <div className={`flex items-center justify-between mb-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <h3 className="text-lg">Nearby Ride Requests</h3>
            <LanguageSwitcher />
          </div>

          {/* Online/Offline Toggle */}
          <div className={`flex items-center justify-between p-3 bg-gray-50 rounded-xl ${
            direction === 'rtl' ? 'flex-row-reverse' : ''
          }`}>
            <div className={direction === 'rtl' ? 'text-right' : ''}>
              <div className="font-medium text-sm">
                {isOnline ? t('dashboard.online') : t('dashboard.offline')}
              </div>
              <div className="text-xs text-gray-500">
                {isOnline ? t('dashboard.available') : t('dashboard.tapOnline')}
              </div>
            </div>
            <button
              onClick={() => setIsOnline(!isOnline)}
              className={`w-14 h-8 rounded-full transition-all relative ${
                isOnline ? 'bg-[#34C759]' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-transform ${
                  isOnline
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

          {/* Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`mt-3 flex items-center gap-2 text-sm text-gray-600 ${
              direction === 'rtl' ? 'flex-row-reverse' : ''
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>

          {showFilters && (
            <div className="mt-3 space-y-3 pt-3 border-t border-gray-200">
              <div>
                <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                  Distance
                </div>
                <div className="flex gap-2">
                  {['all', '5km', '10km', '15km'].map((dist) => (
                    <button
                      key={dist}
                      onClick={() => setDistanceFilter(dist as typeof distanceFilter)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        distanceFilter === dist
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {dist === 'all' ? 'All' : dist}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                  {t('filter.language')}
                </div>
                <div className="flex gap-2">
                  {['en', 'he', 'both'].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguageFilter(lang as typeof languageFilter)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
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

              <div>
                <div className={`text-xs text-gray-600 mb-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                  Passenger Rating
                </div>
                <div className="flex gap-2">
                  {['all', '4+', '5'].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setRatingFilter(rating as typeof ratingFilter)}
                      className={`px-3 py-1 rounded-full text-xs transition ${
                        ratingFilter === rating
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {rating === 'all' ? 'All' : rating === '4+' ? '4+' : '5★'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ride Requests List */}
      <div className="absolute bottom-16 left-0 right-0 max-h-[45%] lg:hidden bg-white rounded-t-3xl shadow-2xl p-6 pb-2 z-20 overflow-auto">
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4" />

        <div className="space-y-3">
          {!isOnline && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-lg mb-2">You're offline</div>
              <div className="text-sm">Go online to see ride requests</div>
            </div>
          )}

          {isOnline && rideRequests
            .filter((request) => !declinedRides.includes(request.id))
            .filter((request) => {
              if (ratingFilter === '4+') return request.passengerRating >= 4;
              if (ratingFilter === '5') return request.passengerRating === 5;
              return true;
            })
            .filter((request) => {
              if (languageFilter === 'both') return true;
              return request.language.includes(languageFilter);
            })
            .map((request) => (
            <div
              key={request.id}
              className="bg-gray-50 rounded-2xl p-4 border-2 border-transparent hover:border-[#0A84FF] transition"
            >
              <div className={`flex items-start justify-between mb-3 ${
                direction === 'rtl' ? 'flex-row-reverse' : ''
              }`}>
                <div className="flex-1">
                  <div className={`space-y-2 ${direction === 'rtl' ? 'text-right' : ''}`}>
                    <div className={`flex items-start gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                      <div className="w-2 h-2 rounded-full bg-[#0A84FF] mt-1.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500">{t('history.pickup')}</div>
                        <div className="text-sm font-medium">{request.pickup}</div>
                      </div>
                    </div>

                    <div className={`flex items-start gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                      <div className="w-2 h-2 rounded-full bg-[#34C759] mt-1.5" />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500">{t('history.dropoff')}</div>
                        <div className="text-sm font-medium">{request.destination}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`ml-4 ${direction === 'rtl' ? 'text-left mr-4 ml-0' : 'text-right'}`}>
                  <div className="text-xl font-medium text-[#34C759] mb-1">
                    {request.fare}
                  </div>
                  <div className="text-xs text-gray-500">{request.distance}</div>
                </div>
              </div>

              <div className={`flex items-center justify-between pt-3 border-t border-gray-200 ${
                direction === 'rtl' ? 'flex-row-reverse' : ''
              }`}>
                <div className={`flex items-center gap-3 text-sm ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex items-center gap-1 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span>{request.passengerRating}</span>
                  </div>
                  <div className="flex gap-1">
                    {request.language.includes('en') && (
                      <span className="px-2 py-0.5 bg-blue-50 text-[#0A84FF] rounded text-xs">EN</span>
                    )}
                    {request.language.includes('he') && (
                      <span className="px-2 py-0.5 bg-blue-50 text-[#0A84FF] rounded text-xs">HE</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setDeclinedRides([...declinedRides, request.id])}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition"
                  >
                    Decline
                  </button>
                  <button
                    onClick={onAcceptRide}
                    className="px-4 py-2 bg-[#0A84FF] text-white rounded-lg text-sm hover:bg-[#0A84FF]/90 transition"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
