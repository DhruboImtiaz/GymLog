import React from 'react';
import { NavLink } from 'react-router-dom';
import { WorkoutIcon, MeasurementIcon } from '../ui/Icons';

export function BottomNav() {
  return (
    <nav className="bottom-nav" id="bottomNav">
      <div className="sidebar-brand nav-brand">GYMLOG</div>
      <NavLink 
        to="/" 
        className={({ isActive }) => `bnav-item ${isActive ? 'active' : ''}`}
      >
        <WorkoutIcon />
        Workouts
      </NavLink>
      <NavLink 
        to="/measurements" 
        className={({ isActive }) => `bnav-item ${isActive ? 'active' : ''}`}
      >
        <MeasurementIcon />
        Measurements
      </NavLink>
    </nav>
  );
}
