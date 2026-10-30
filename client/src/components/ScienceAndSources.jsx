/**
 * HELIOS PROTOCOL: Space Weather Superhero Tycoon
 * ScienceAndSources.jsx — Comprehensive NASA Data Integration & Scientific Citations Modal
 * Built for the NASA International Space Apps Challenge 2026.
 */

import React, { useState } from 'react';
import '../styles/glitch.css';

export default function ScienceAndSources({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(4, 11, 22, 0.94)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        boxSizing: 'border-box',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="wireframe-box crt-overlay"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#061120',
          padding: '2rem',
          borderColor: '#38BDF8',
          boxShadow: '0 0 40px rgba(56, 189, 248, 0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid rgba(56, 189, 248, 0.35)',
            paddingBottom: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#38BDF8',
                letterSpacing: '2px',
                fontFamily: 'ui-monospace, monospace',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              [HELIOS PROTOCOL // SCIENTIFIC AUDIT & DATA PEDIGREE]
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.6rem',
                color: '#FFFFFF',
                fontFamily: 'ui-monospace, monospace',
                textShadow: '-2px 0 #FF2D95, 2px 0 #38BDF8',
              }}
            >
              NASA DATA & SPACE WEATHER SCIENCE
            </h2>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.65)',
                marginTop: '4px',
              }}
            >
              Built for the <strong>NASA International Space Apps Challenge 2026</strong>.
            </div>
          </div>

          <button
            onClick={onClose}
            className="glitch-btn"
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              borderColor: '#38BDF8',
              color: '#38BDF8',
              boxShadow: '0 0 10px rgba(56, 189, 248, 0.3)',
            }}
          >
            [ESC // CLOSE]
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '8px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'overview', label: '1. THREE PILLARS (OBS/FCST/HERO)' },
            { id: 'donki', label: '2. NASA DONKI (CME & SOLAR WIND)' },
            { id: 'sdo', label: '3. NASA SDO (SOLAR FLARES)' },
            { id: 'noaa', label: '4. NOAA SWPC & MAGNETOSPHERE' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: activeTab === tab.id ? '1px solid #38BDF8' : '1px solid transparent',
                color: activeTab === tab.id ? '#7DD3FC' : 'rgba(255, 255, 255, 0.6)',
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                fontFamily: 'ui-monospace, monospace',
                cursor: 'pointer',
                borderRadius: '3px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: THREE PILLARS */}
        {activeTab === 'overview' && (
          <div>
            <h3 style={{ color: '#38BDF8', marginTop: 0, fontSize: '1.15rem' }}>
              The Three Simulation Tiers: Architecture & Labeling
            </h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.85)' }}>
              To ensure scientific rigor for NASA Space Apps judging, HELIOS PROTOCOL explicitly separates
              real observational astronomy, predictive heliospheric modeling, and interactive superhero tycoon gameplay:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '1rem' }}>
              <div className="wireframe-box" style={{ padding: '14px', borderColor: '#38BDF8' }}>
                <span className="badge-live-obs" style={{ display: 'inline-block', marginBottom: '8px' }}>
                  LIVE OBSERVATION
                </span>
                <div style={{ fontWeight: 800, color: '#38BDF8', fontSize: '0.95rem', marginBottom: '6px' }}>
                  Solar Observation Centre
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5 }}>
                  Represents ground-truth solar telemetry from NASA SDO (Solar Dynamics Observatory) and GOES satellites.
                  Simulates extreme ultraviolet (EUV) solar flares erupting at the speed of light (c ~ 8.3 minutes to Earth).
                </div>
              </div>

              <div className="wireframe-box" style={{ padding: '14px', borderColor: '#FBBF24' }}>
                <span className="badge-scientific-forecast" style={{ display: 'inline-block', marginBottom: '8px' }}>
                  SCIENTIFIC FORECAST
                </span>
                <div style={{ fontWeight: 800, color: '#FBBF24', fontSize: '0.95rem', marginBottom: '6px' }}>
                  Space Weather Research Lab
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5 }}>
                  Simulates NASA DONKI (Space Weather Database of Notifications, Knowledge, Information) and the WSA-Enlil
                  solar wind cone model. Predicts Coronal Mass Ejection (CME) transit times (15 to 72 hours) and plasma shock waves.
                </div>
              </div>

              <div className="wireframe-box" style={{ padding: '14px', borderColor: '#FF2D95' }}>
                <span className="badge-hero-mission" style={{ display: 'inline-block', marginBottom: '8px' }}>
                  SIMULATED HERO MISSION
                </span>
                <div style={{ fontWeight: 800, color: '#FF2D95', fontSize: '0.95rem', marginBottom: '6px' }}>
                  Satellite Protection Division
                </div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.75)', lineHeight: 1.5 }}>
                  The player-controlled superhero tycoon agency. Deploys advanced magnetic deflection cruisers and plasma-containment
                  interceptors to safeguard Earth's power grids, GPS constellations, and astronauts from catastrophic ionizing radiation.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: NASA DONKI */}
        {activeTab === 'donki' && (
          <div>
            <h3 style={{ color: '#FBBF24', marginTop: 0, fontSize: '1.15rem' }}>
              NASA DONKI: Coronal Mass Ejections & Interplanetary Shocks
            </h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.85)' }}>
              <strong>DONKI (Space Weather Database of Notifications, Knowledge, Information)</strong> is a comprehensive
              on-line tool for space weather forecasters, scientists, and the general space operations community.
            </p>
            <ul style={{ fontSize: '0.82rem', lineHeight: 1.7, color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '1.2rem' }}>
              <li>
                <strong>CME Modeling:</strong> Coronal Mass Ejections are massive expulsions of magnetized plasma from the solar corona.
                HELIOS simulates CME speeds between 300 km/s (slow streamer blowouts) up to over 2,000 km/s (fast interplanetary shock waves).
              </li>
              <li>
                <strong>WSA-Enlil Simulation:</strong> The Enlil 3D Magnetohydrodynamic (MHD) numerical model simulates solar wind background
                and CME shock arrival at 1 AU (Earth orbit), providing the exact transit window represented in game timers.
              </li>
              <li>
                <strong>Solar Energetic Particles (SEP):</strong> High-energy protons (&gt;10 MeV) accelerated by CME shocks that pose
                lethal radiation hazards to astronauts on Artemis lunar missions and LEO satellites.
              </li>
            </ul>
            <div style={{ padding: '10px 14px', background: 'rgba(251, 191, 36, 0.1)', borderLeft: '3px solid #FBBF24', marginTop: '1rem', fontSize: '0.78rem' }}>
              <strong>Official Reference:</strong> NASA Space Weather Analysis Center (SWAC) & Community Coordinated Modeling Center (CCMC) DONKI API pipeline.
            </div>
          </div>
        )}

        {/* TAB 3: NASA SDO */}
        {activeTab === 'sdo' && (
          <div>
            <h3 style={{ color: '#38BDF8', marginTop: 0, fontSize: '1.15rem' }}>
              NASA SDO: Solar Dynamics Observatory & Flare Mechanics
            </h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.85)' }}>
              Launched in 2010, the <strong>Solar Dynamics Observatory (SDO)</strong> investigates how solar activity is created
              and drives space weather. SDO provides ultra-high-definition imaging of the solar corona in multiple wavelengths simultaneously.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '0.8rem' }}>
              <div className="wireframe-box" style={{ padding: '12px' }}>
                <div style={{ color: '#7DD3FC', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>
                  AIA 131Å (Teal) / 171Å (Gold)
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Measures flaring coronal loops at temperatures up to 10,000,000 Kelvin (10 MK).
                  Tracks the emergence of complex magnetic flux ropes in sunspot groups like AR 3664.
                </div>
              </div>
              <div className="wireframe-box" style={{ padding: '12px' }}>
                <div style={{ color: '#FF5FB0', fontWeight: 700, fontSize: '0.82rem', marginBottom: '4px' }}>
                  GOES X-Ray Flare Classification
                </div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  <strong>C-Class:</strong> Minor solar events.<br />
                  <strong>M-Class:</strong> Medium flares causing localized radio blackouts.<br />
                  <strong>X-Class:</strong> Major ionizing explosions (&gt; 10^-4 W/m²) capable of worldwide blackouts.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: NOAA SWPC & MAGNETOSPHERE */}
        {activeTab === 'noaa' && (
          <div>
            <h3 style={{ color: '#FF2D95', marginTop: 0, fontSize: '1.15rem' }}>
              NOAA SWPC: Space Weather Scales & Magnetosphere Integrity
            </h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.85)' }}>
              The <strong>NOAA Space Weather Prediction Center (SWPC)</strong> is the nation’s official source of space weather alerts
              and planetary geomagnetic disturbance metrics.
            </p>
            <ul style={{ fontSize: '0.82rem', lineHeight: 1.7, color: 'rgba(255, 255, 255, 0.8)', paddingLeft: '1.2rem' }}>
              <li>
                <strong>Planetary K-index (Kp):</strong> Quantifies geomagnetic disturbances on a logarithmic scale from 0 to 9.
                Kp &ge; 5 indicates a geomagnetic storm, while Kp &ge; 8 indicates severe G4/G5 planetary storms.
              </li>
              <li>
                <strong>Magnetosphere Bow Shock Compression:</strong> Earth's intrinsic dipole magnetic field normally balances solar wind dynamic
                pressure at a standoff distance of ~10 Earth Radii (Re). Under intense CME dynamic pressure, the magnetopause is compressed
                inside geostationary orbit (6.6 Re), exposing commercial and defense satellites directly to interplanetary plasma.
              </li>
              <li>
                <strong>Magnetosphere Integrity (In-Game 0–100%):</strong> Simulates the shielding capacity of Earth's geomagnetic dipole.
                If integrity drops to 0%, geomagnetic induced currents (GICs) surge through high-voltage ground transformers, causing catastrophic blackout grids.
              </li>
            </ul>
          </div>
        )}

        {/* Bottom Banner */}
        <div
          style={{
            marginTop: '1.8rem',
            padding: '12px 16px',
            backgroundColor: 'rgba(6, 17, 32, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            HELIOS PROTOCOL // NASA INTERNATIONAL SPACE APPS CHALLENGE 2026 // OPEN TELEMETRY
          </div>
          <button
            onClick={onClose}
            className="chunky-tactile-btn"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
          >
            RETURN TO COMMAND CONSOLE
          </button>
        </div>
      </div>
    </div>
  );
}
