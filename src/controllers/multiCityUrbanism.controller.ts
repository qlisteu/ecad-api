import { Request, Response } from 'express';
import { multiCityUrbanismService } from '../services/multiCityUrbanismService';
import { getCityConfig, getAllCounties } from '../config/cities';

export class MultiCityUrbanismController {
  public lookupAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('Multi-city request received:', req.body);
      
      const { address, cityId, includeAnalysis } = req.body;

      if (!address || typeof address !== 'string' || address.trim().length === 0) {
        console.log('Invalid address provided');
        res.status(400).json({ error: 'Address is required' });
        return;
      }

      if (!cityId || typeof cityId !== 'string') {
        console.log('City ID is required');
        res.status(400).json({ error: 'City ID is required' });
        return;
      }

      console.log(`Looking up address: "${address}" in city: "${cityId}" with analysis: ${includeAnalysis}`);
      
      // For now, we'll use the basic lookup without analysis
      // Analysis can be added later when we have PDF processing for other cities
      const result = await multiCityUrbanismService.lookupAddress(cityId, address.trim());

      console.log('Multi-city lookup successful, returning result');
      res.status(200).json(result);
    } catch (error: any) {
      console.error('Error looking up address in multi-city service:', error);
      res.status(500).json({ error: 'Failed to lookup address' });
    }
  };

  public getCities = async (req: Request, res: Response): Promise<void> => {
    try {
      const cities = getAllCounties().map(county => ({
        county,
        cities: require('../config/cities').getCitiesByCounty(county)
      }));
      
      res.status(200).json(cities);
    } catch (error: any) {
      console.error('Error getting cities:', error);
      res.status(500).json({ error: 'Failed to get cities' });
    }
  };

  public getCityInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { cityId } = req.params;
      
      if (!cityId) {
        res.status(400).json({ error: 'City ID is required' });
        return;
      }

      const cityConfig = getCityConfig(cityId);
      if (!cityConfig) {
        res.status(404).json({ error: 'City not found' });
        return;
      }

      // Return city info without sensitive data
      const cityInfo = {
        id: cityConfig.id,
        name: cityConfig.name,
        county: cityConfig.county,
        coordinates: cityConfig.coordinates,
        requiresAuth: cityConfig.urbanismService.requiresAuth
      };

      res.status(200).json(cityInfo);
    } catch (error: any) {
      console.error('Error getting city info:', error);
      res.status(500).json({ error: 'Failed to get city info' });
    }
  };
}
