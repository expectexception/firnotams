import React from 'react';
import * as LucideIcons from 'lucide-react';
import { 
  Cloud, 
  CloudFog, 
  CloudHail, 
  CloudLightning, 
  CloudRain, 
  Flame, 
  HelpCircle, 
  Sun, 
  Snowflake, 
  Tornado, 
  Wind,
  Haze,
  Waves,
  Cloudy
} from 'lucide-react';

/**
 * Maps the internal icons to Lucide icons.
 * This is a simplified version of the IconMapper that uses only Lucide icons
 * to avoid adding new dependencies (react-icons/wi) unless requested.
 */
export const getWeatherIcon = (iconName: string, className: string = '') => {
  const iconMap: Record<string, any> = {
    'Sun': Sun,
    'CloudLightning': CloudLightning,
    'CloudHail': CloudHail,
    'Snowflake': Snowflake,
    'CloudRain': CloudRain,
    'Flame': Flame, // Volcanic Ash
    'Tornado': Tornado, // Severe Weather
    'CloudFog': CloudFog,
    'Cloud': Cloud,
    'Wind': Wind,
    'Haze': Haze,
    'Smoke': Waves, // Approximate
    'Showers': CloudRain,
    'PartlyCloudy': Cloudy,
    'Overcast': Cloud
  };

  const IconComponent = iconMap[iconName] || LucideIcons[iconName as keyof typeof LucideIcons] || HelpCircle;

  return React.createElement(IconComponent as any, { className });
};
