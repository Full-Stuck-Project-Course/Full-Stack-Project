import { Calendar, MapPin, Star, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../context/language-context';
import { LanguageSwitcher } from './language-switcher';

interface ActivityScreenProps {
  mode: 'passenger' | 'driver';
}

export function ActivityScreen({ mode }: ActivityScreenProps) {
  const { t, direction } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [expandedRideId, setExpandedRideId] = useState<number | null>(null);

  const rides = [
    {
      id: 1,
      date: 'Today, 2:45 PM',
      pickup: '123 Main St',
      destination: 'Airport Terminal 2',
      fare: '$32.50',
      status: 'completed',
      rating: 5,
      driverName: 'David Kim',
    },
    {
      id: 2,
      date: 'Today, 9:30 AM',
      pickup: 'Home',
      destination: 'Office Building',
      fare: '$12.00',
      status: 'completed',
      rating: 5,
      driverName: 'Sarah Chen',
    },
    {
      id: 3,
      date: 'Yesterday, 6:15 PM',
      pickup: 'Mall',
      destination: 'Restaurant Downtown',
      fare: '$18.50',
      status: 'completed',
      rating: 4,
      driverName: 'Mike Johnson',
    },
    {
      id: 4,
      date: 'Yesterday, 11:00 AM',
      pickup: 'Coffee Shop',
      destination: 'Park',
      fare: '$8.00',
      status: 'cancelled',
      driverName: null,
    },
  ];

  const filteredRides = rides.filter(ride => {
    if (filter === 'all') return true;
    return ride.status === filter;
  });

  return (
    <div className="h-full w-full bg-gray-50 overflow-auto pb-20 lg:pb-0" dir={direction}>
      {/* Header */}
      <div className="bg-white pt-14 pb-6 px-6 border-b border-gray-200 sticky top-0 z-10 lg:pt-8">
        <div className={`flex items-center justify-between mb-4 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
          <h2>{t('activity.title')}</h2>
          <LanguageSwitcher />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as typeof filter)}
              className={`px-4 py-2 rounded-full text-sm transition ${
                filter === status
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t(`activity.${status}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Rides List */}
      <div className="p-4 space-y-3 lg:max-w-4xl lg:mx-auto">
        {filteredRides.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">{t('activity.noRides')}</div>
            <div className="text-sm text-gray-500">{t('activity.tryFilter')}</div>
          </div>
        )}

        {filteredRides.map((ride) => (
          <div
            key={ride.id}
            className={`bg-white rounded-2xl p-4 shadow-sm ${
              direction === 'rtl' ? 'text-right' : 'text-left'
            }`}
          >
            <div className={`flex items-start justify-between mb-3 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <div className="flex-1">
                <div className={`flex items-center gap-2 text-gray-600 mb-2 ${
                  direction === 'rtl' ? 'flex-row-reverse' : ''
                }`}>
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm">{ride.date}</span>
                </div>

                <div className="space-y-2">
                  <div className={`flex items-start gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-[#0A84FF] mt-1.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{ride.pickup}</div>
                    </div>
                  </div>

                  <div className={`flex items-start gap-2 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <div className="w-2 h-2 rounded-full bg-[#34C759] mt-1.5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{ride.destination}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`ml-4 ${direction === 'rtl' ? 'text-left mr-4 ml-0' : 'text-right'}`}>
                <div className="text-lg font-medium mb-1">{ride.fare}</div>
                {ride.status === 'completed' && ride.rating && (
                  <div className={`flex items-center gap-1 ${direction === 'rtl' ? 'flex-row-reverse' : ''}`}>
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm">{ride.rating}</span>
                  </div>
                )}
                {ride.status === 'cancelled' && (
                  <span className="text-xs text-red-500">{t('activity.cancelled.status')}</span>
                )}
              </div>
            </div>

            {ride.driverName && (
              <>
                <button
                  onClick={() => setExpandedRideId(expandedRideId === ride.id ? null : ride.id)}
                  className={`w-full pt-3 border-t border-gray-100 flex items-center justify-between hover:bg-gray-50 transition ${
                    direction === 'rtl' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div className="text-sm text-gray-600">
                    {mode === 'passenger' ? 'Driver' : 'Passenger'}: {ride.driverName}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${
                    expandedRideId === ride.id ? 'rotate-90' : ''
                  } ${direction === 'rtl' ? 'rotate-180' : ''}`} />
                </button>

                {expandedRideId === ride.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex gap-2">
                      <button className="flex-1 py-2 px-4 bg-[#0A84FF] text-white rounded-lg text-sm hover:bg-[#0A84FF]/90 transition">
                        {t('history.receipt')}
                      </button>
                      {ride.status === 'completed' && (
                        <button className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                          {t('history.rebook')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
