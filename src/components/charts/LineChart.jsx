import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from '../../context/ThemeContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function LineChart({ labels, data, color }) {
  const { theme } = useTheme();
  
  const dark = theme === 'dark';
  const gc = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tc = dark ? '#777' : '#888';

  const chartData = {
    labels,
    datasets: [
      {
        data,
        borderColor: color,
        backgroundColor: color + '22', // vanilla mimics opacity via hex append
        pointBackgroundColor: color,
        pointRadius: 5,
        tension: 0.3,
        fill: true,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: dark ? '#1c1c1c' : '#fff',
        titleColor: dark ? '#eee' : '#111',
        bodyColor: dark ? '#aaa' : '#555',
        borderColor: color,
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: tc, maxRotation: 40, font: { size: 11 } },
        grid: { color: gc }
      },
      y: {
        ticks: { color: tc, font: { size: 11 } },
        grid: { color: gc }
      }
    }
  };

  return <Line data={chartData} options={options} />;
}
