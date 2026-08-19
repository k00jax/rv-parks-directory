import type { Park } from '@/lib/types';
import { aqiLevel, fmtFetchedAt } from '@/lib/parks';

// Live weather + air quality card for a park page. Renders ONLY data that came
// from the Google Weather/Air Quality APIs — when either snapshot is absent
// (API error or not fetched) that part of the card is simply not rendered.
// Never fabricates a temperature or AQI.
export default function WeatherCard({ park }: { park: Park }) {
  const w = park.weatherCurrent;
  const a = park.aqi;
  if (!w && !a) return null;

  const level = aqiLevel(a?.aqi ?? null);
  const levelClass = level ? `aqi-${level}` : '';

  return (
    <div className="weather-card">
      <h2>Current conditions</h2>
      <div className="weather-card-grid">
        {w ? (
          <div className="weather-cell">
            <div className="weather-temp">
              {w.tempF !== null ? `${Math.round(w.tempF)}°F` : '—'}
            </div>
            <div className="muted">
              {w.conditions ?? 'Conditions not reported'}
              {w.isDaytime === false ? ' · night' : w.isDaytime === true ? ' · day' : ''}
              {w.timeZone ? (
                <>
                  <br />
                  <span className="small">{w.timeZone.replace('_', ' ')}</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
        {a ? (
          <div className="weather-cell">
            <div className={`weather-aqi ${levelClass}`}>
              <span className="weather-aqi-value">{a.aqi !== null ? a.aqi : '—'}</span>
              <span className="small">AQI</span>
            </div>
            <div className="muted">{a.category ?? 'Air quality not reported'}</div>
          </div>
        ) : null}
      </div>
      <p className="small muted">
        Live from Google Weather &amp; Air Quality API · fetched {fmtFetchedAt(w?.fetchedAt ?? a?.fetchedAt ?? null)}
      </p>
    </div>
  );
}
