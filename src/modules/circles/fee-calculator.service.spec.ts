import { FeeCalculatorService } from './fee-calculator.service';
import { Prisma } from '@prisma/client';

describe('FeeCalculatorService', () => {
  let service: FeeCalculatorService;

  beforeEach(() => {
    service = new FeeCalculatorService();
  });

  describe('12-Month Circle Fee Table (Official Calculation Spec)', () => {
    const circle12m_12k = {
      amount: new Prisma.Decimal(12000), // Tier 1,000 EGP/mo (Total 12,000 EGP)
      feePolicySnapshot: {
        '1': 16.0,
        '2': 14.0,
        '3': 12.0,
        '4': 10.0,
        '5': 8.0,
        '6': 6.0,
        '7': 0.0,
        '8': 0.0,
        '9': 0.0,
        '10': -7.0,
        '11': -10.0,
        '12': -12.0,
      },
    };

    const circle12m_24k = {
      amount: new Prisma.Decimal(24000), // Tier 2,000 EGP/mo (Total 24,000 EGP)
      feePolicySnapshot: circle12m_12k.feePolicySnapshot,
    };

    const circle12m_36k = {
      amount: new Prisma.Decimal(36000), // Tier 3,000 EGP/mo (Total 36,000 EGP)
      feePolicySnapshot: circle12m_12k.feePolicySnapshot,
    };

    it('Turn 1 (-16% rate): Net is 10,080 for 12k, 20,160 for 24k, 30,240 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 1).net.toString()).toBe('10080');
      expect(service.calculateNetPayout(circle12m_24k, 1).net.toString()).toBe('20160');
      expect(service.calculateNetPayout(circle12m_36k, 1).net.toString()).toBe('30240');
    });

    it('Turn 4 (-10% rate): Net is 10,800 for 12k, 21,600 for 24k, 32,400 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 4).net.toString()).toBe('10800');
      expect(service.calculateNetPayout(circle12m_24k, 4).net.toString()).toBe('21600');
      expect(service.calculateNetPayout(circle12m_36k, 4).net.toString()).toBe('32400');
    });

    it('Turn 7 (0% rate): Net is 12,000 for 12k, 24,000 for 24k, 36,000 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 7).net.toString()).toBe('12000');
      expect(service.calculateNetPayout(circle12m_24k, 7).net.toString()).toBe('24000');
      expect(service.calculateNetPayout(circle12m_36k, 7).net.toString()).toBe('36000');
    });

    it('Turn 10 (+7% cashback): Net is 12,840 for 12k, 25,680 for 24k, 38,520 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 10).net.toString()).toBe('12840');
      expect(service.calculateNetPayout(circle12m_24k, 10).net.toString()).toBe('25680');
      expect(service.calculateNetPayout(circle12m_36k, 10).net.toString()).toBe('38520');
    });

    it('Turn 11 (+10% cashback): Net is 13,200 for 12k, 26,400 for 24k, 39,600 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 11).net.toString()).toBe('13200');
      expect(service.calculateNetPayout(circle12m_24k, 11).net.toString()).toBe('26400');
      expect(service.calculateNetPayout(circle12m_36k, 11).net.toString()).toBe('39600');
    });

    it('Turn 12 (+12% cashback): Net is 13,440 for 12k, 26,880 for 24k, 40,320 for 36k', () => {
      expect(service.calculateNetPayout(circle12m_12k, 12).net.toString()).toBe('13440');
      expect(service.calculateNetPayout(circle12m_24k, 12).net.toString()).toBe('26880');
      expect(service.calculateNetPayout(circle12m_36k, 12).net.toString()).toBe('40320');
    });
  });

  describe('10-Month Circle Fee Table', () => {
    const circle10m = {
      amount: new Prisma.Decimal(10000),
      feePolicySnapshot: {
        '1': 14.0,
        '2': 12.0,
        '3': 10.0,
        '4': 8.0,
        '5': 6.0,
        '6': 0.0,
        '7': 0.0,
        '8': -5.0,
        '9': -7.0,
        '10': -10.0,
      },
    };

    it('Position 1 (14% fee): Net is 8,600', () => {
      expect(service.calculateNetPayout(circle10m, 1).net.toString()).toBe('8600');
    });

    it('Position 8 (+5% cashback): Net is 10,500', () => {
      expect(service.calculateNetPayout(circle10m, 8).net.toString()).toBe('10500');
    });

    it('Position 10 (+10% cashback): Net is 11,000', () => {
      expect(service.calculateNetPayout(circle10m, 10).net.toString()).toBe('11000');
    });
  });

  it('should throw BadRequestException if position is missing from snapshot', () => {
    const circle = {
      amount: new Prisma.Decimal(6000),
      feePolicySnapshot: { '1': 5.0 },
    };

    expect(() => service.calculateNetPayout(circle, 2)).toThrow(
      'Payout position 2 not found in circle fee policy snapshot',
    );
  });
});
