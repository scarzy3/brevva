import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Stable UUIDs for cross-referencing ──────────────────────────────

const ids = {
  org: randomUUID(),
  ownerUser: randomUUID(),
  // Properties
  singleFamily: randomUUID(),
  duplex: randomUUID(),
  apartment: randomUUID(),
  // Units (single-family gets 1, duplex gets 2, apartment gets 4 = 7 total)
  unitSF1: randomUUID(),
  unitDup1: randomUUID(),
  unitDup2: randomUUID(),
  unitApt1: randomUUID(),
  unitApt2: randomUUID(),
  unitApt3: randomUUID(),
  unitApt4: randomUUID(),
  // Tenants (5 active)
  tenant1: randomUUID(),
  tenant2: randomUUID(),
  tenant3: randomUUID(),
  tenant4: randomUUID(),
  tenant5: randomUUID(),
  // Tenant user accounts (for portal access)
  tenantUser1: randomUUID(),
  tenantUser2: randomUUID(),
  tenantUser3: randomUUID(),
  tenantUser4: randomUUID(),
  tenantUser5: randomUUID(),
  // Leases
  lease1: randomUUID(),
  lease2: randomUUID(),
  lease3: randomUUID(),
  lease4: randomUUID(),
  lease5: randomUUID(),
  // Vendors
  vendor1: randomUUID(),
  vendor2: randomUUID(),
  // Maintenance requests
  maint1: randomUUID(),
  maint2: randomUUID(),
  maint3: randomUUID(),
};

// ─── Helper functions ────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Seed function ───────────────────────────────────────────────────

async function main() {
  console.log("Seeding database...\n");

  // Clear existing data in reverse dependency order
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.connectedEmail.deleteMany(),
    prisma.message.deleteMany(),
    prisma.messageThread.deleteMany(),
    prisma.document.deleteMany(),
    prisma.adverseAction.deleteMany(),
    prisma.screeningReport.deleteMany(),
    prisma.application.deleteMany(),
    prisma.maintenanceRequest.deleteMany(),
    prisma.lateFee.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentMethodRecord.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.recurringTemplate.deleteMany(),
    prisma.leaseAddendum.deleteMany(),
    prisma.leaseTenant.deleteMany(),
    prisma.lease.deleteMany(),
    prisma.tenantPet.deleteMany(),
    prisma.tenantVehicle.deleteMany(),
    prisma.tenantDocument.deleteMany(),
    prisma.tenant.deleteMany(),
    prisma.propertyPhoto.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.property.deleteMany(),
    prisma.expenseCategory.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);

  // ─── Organization ──────────────────────────────────────────────────

  const org = await prisma.organization.create({
    data: {
      id: ids.org,
      name: "Demo Properties LLC",
      slug: "demo-properties",
      plan: "PRO",
    },
  });
  console.log(`  Organization: ${org.name}`);

  // ─── Owner User ────────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash("demo1234", 12);

  const owner = await prisma.user.create({
    data: {
      id: ids.ownerUser,
      organizationId: ids.org,
      email: "demo@brevva.io",
      passwordHash,
      firstName: "John",
      lastName: "Smith",
      role: "OWNER",
      phone: "(555) 123-4567",
      lastLoginAt: new Date(),
    },
  });
  console.log(`  Owner: ${owner.email}`);

  // ─── Tenant User Accounts ─────────────────────────────────────────

  const tenantPassword = await bcrypt.hash("tenant1234", 12);

  const tenantUsers = await Promise.all([
    prisma.user.create({
      data: {
        id: ids.tenantUser1,
        organizationId: ids.org,
        email: "sarah.johnson@email.com",
        passwordHash: tenantPassword,
        firstName: "Sarah",
        lastName: "Johnson",
        role: "TENANT",
        phone: "(555) 234-5678",
      },
    }),
    prisma.user.create({
      data: {
        id: ids.tenantUser2,
        organizationId: ids.org,
        email: "mike.chen@email.com",
        passwordHash: tenantPassword,
        firstName: "Mike",
        lastName: "Chen",
        role: "TENANT",
        phone: "(555) 345-6789",
      },
    }),
    prisma.user.create({
      data: {
        id: ids.tenantUser3,
        organizationId: ids.org,
        email: "emily.davis@email.com",
        passwordHash: tenantPassword,
        firstName: "Emily",
        lastName: "Davis",
        role: "TENANT",
        phone: "(555) 456-7890",
      },
    }),
    prisma.user.create({
      data: {
        id: ids.tenantUser4,
        organizationId: ids.org,
        email: "james.wilson@email.com",
        passwordHash: tenantPassword,
        firstName: "James",
        lastName: "Wilson",
        role: "TENANT",
        phone: "(555) 567-8901",
      },
    }),
    prisma.user.create({
      data: {
        id: ids.tenantUser5,
        organizationId: ids.org,
        email: "maria.garcia@email.com",
        passwordHash: tenantPassword,
        firstName: "Maria",
        lastName: "Garcia",
        role: "TENANT",
        phone: "(555) 678-9012",
      },
    }),
  ]);
  console.log(`  Tenant users: ${tenantUsers.length} created`);

  // ─── Properties ────────────────────────────────────────────────────

  const properties = await Promise.all([
    prisma.property.create({
      data: {
        id: ids.singleFamily,
        organizationId: ids.org,
        name: "Oakwood Cottage",
        address: "742 Oakwood Drive",
        city: "Austin",
        state: "TX",
        zip: "78701",
        type: "SINGLE_FAMILY",
        status: "ACTIVE",
        purchasePrice: new Prisma.Decimal(285000),
        purchaseDate: new Date("2021-06-15"),
        mortgageBalance: new Prisma.Decimal(218000),
        insuranceProvider: "State Farm",
        insurancePolicyNumber: "SF-2021-78453",
        insuranceExpiry: new Date("2026-06-15"),
        notes: "Well-maintained 3BR/2BA craftsman bungalow with updated kitchen.",
      },
    }),
    prisma.property.create({
      data: {
        id: ids.duplex,
        organizationId: ids.org,
        name: "Elm Street Duplex",
        address: "1580 Elm Street",
        city: "Austin",
        state: "TX",
        zip: "78702",
        type: "MULTI_FAMILY",
        status: "ACTIVE",
        purchasePrice: new Prisma.Decimal(425000),
        purchaseDate: new Date("2022-03-01"),
        mortgageBalance: new Prisma.Decimal(365000),
        insuranceProvider: "Allstate",
        insurancePolicyNumber: "AS-2022-11290",
        insuranceExpiry: new Date("2026-03-01"),
        notes: "Side-by-side duplex, each unit has separate entrance and yard.",
      },
    }),
    prisma.property.create({
      data: {
        id: ids.apartment,
        organizationId: ids.org,
        name: "Riverside Apartments",
        address: "305 River Road",
        city: "Austin",
        state: "TX",
        zip: "78703",
        type: "MULTI_FAMILY",
        status: "ACTIVE",
        purchasePrice: new Prisma.Decimal(780000),
        purchaseDate: new Date("2020-09-10"),
        mortgageBalance: new Prisma.Decimal(612000),
        insuranceProvider: "Liberty Mutual",
        insurancePolicyNumber: "LM-2020-44821",
        insuranceExpiry: new Date("2026-09-10"),
        notes:
          "4-unit apartment building near downtown. On-site laundry, off-street parking.",
      },
    }),
  ]);
  console.log(`  Properties: ${properties.length} created`);

  // ─── Units ─────────────────────────────────────────────────────────

  const units = await Promise.all([
    // Single-family: 1 unit (the whole house)
    prisma.unit.create({
      data: {
        id: ids.unitSF1,
        propertyId: ids.singleFamily,
        organizationId: ids.org,
        unitNumber: "1",
        bedrooms: 3,
        bathrooms: new Prisma.Decimal(2),
        sqFt: 1450,
        floor: 1,
        rent: new Prisma.Decimal(1800),
        deposit: new Prisma.Decimal(1800),
        status: "OCCUPIED",
        description:
          "Spacious single-family home with open floor plan, hardwood floors, and fenced backyard.",
        amenities: [
          "Central AC",
          "Washer/Dryer",
          "Garage",
          "Fenced Yard",
          "Dishwasher",
        ],
      },
    }),
    // Duplex: 2 units
    prisma.unit.create({
      data: {
        id: ids.unitDup1,
        propertyId: ids.duplex,
        organizationId: ids.org,
        unitNumber: "A",
        bedrooms: 2,
        bathrooms: new Prisma.Decimal(1),
        sqFt: 950,
        floor: 1,
        rent: new Prisma.Decimal(1400),
        deposit: new Prisma.Decimal(1400),
        status: "OCCUPIED",
        description: "Cozy 2BR unit with private entrance and small yard.",
        amenities: [
          "Central AC",
          "Washer/Dryer Hookups",
          "Private Entrance",
          "Yard",
        ],
      },
    }),
    prisma.unit.create({
      data: {
        id: ids.unitDup2,
        propertyId: ids.duplex,
        organizationId: ids.org,
        unitNumber: "B",
        bedrooms: 2,
        bathrooms: new Prisma.Decimal(1),
        sqFt: 950,
        floor: 1,
        rent: new Prisma.Decimal(1350),
        deposit: new Prisma.Decimal(1350),
        status: "OCCUPIED",
        description: "Bright 2BR unit with updated bathroom and new appliances.",
        amenities: [
          "Central AC",
          "Washer/Dryer Hookups",
          "Private Entrance",
          "Yard",
        ],
      },
    }),
    // Apartment building: 4 units
    prisma.unit.create({
      data: {
        id: ids.unitApt1,
        propertyId: ids.apartment,
        organizationId: ids.org,
        unitNumber: "101",
        bedrooms: 1,
        bathrooms: new Prisma.Decimal(1),
        sqFt: 650,
        floor: 1,
        rent: new Prisma.Decimal(950),
        deposit: new Prisma.Decimal(950),
        status: "OCCUPIED",
        description: "Ground floor 1BR unit with patio access.",
        amenities: ["Central AC", "Patio", "On-site Laundry", "Parking"],
      },
    }),
    prisma.unit.create({
      data: {
        id: ids.unitApt2,
        propertyId: ids.apartment,
        organizationId: ids.org,
        unitNumber: "102",
        bedrooms: 1,
        bathrooms: new Prisma.Decimal(1),
        sqFt: 650,
        floor: 1,
        rent: new Prisma.Decimal(900),
        deposit: new Prisma.Decimal(900),
        status: "VACANT",
        description: "Ground floor 1BR unit, recently renovated.",
        amenities: ["Central AC", "On-site Laundry", "Parking"],
      },
    }),
    prisma.unit.create({
      data: {
        id: ids.unitApt3,
        propertyId: ids.apartment,
        organizationId: ids.org,
        unitNumber: "201",
        bedrooms: 2,
        bathrooms: new Prisma.Decimal(1),
        sqFt: 850,
        floor: 2,
        rent: new Prisma.Decimal(1200),
        deposit: new Prisma.Decimal(1200),
        status: "OCCUPIED",
        description:
          "Upper floor 2BR with city views and extra closet space.",
        amenities: [
          "Central AC",
          "City Views",
          "On-site Laundry",
          "Parking",
        ],
      },
    }),
    prisma.unit.create({
      data: {
        id: ids.unitApt4,
        propertyId: ids.apartment,
        organizationId: ids.org,
        unitNumber: "202",
        bedrooms: 2,
        bathrooms: new Prisma.Decimal(1.5),
        sqFt: 900,
        floor: 2,
        rent: new Prisma.Decimal(2200),
        deposit: new Prisma.Decimal(2200),
        status: "VACANT",
        description:
          "Premium corner unit with 1.5 bath, in-unit washer/dryer, and balcony.",
        amenities: [
          "Central AC",
          "In-unit Washer/Dryer",
          "Balcony",
          "City Views",
          "Parking",
        ],
      },
    }),
  ]);
  console.log(`  Units: ${units.length} created (5 occupied, 2 vacant)`);

  // ─── Tenants ───────────────────────────────────────────────────────

  const tenants = await Promise.all([
    prisma.tenant.create({
      data: {
        id: ids.tenant1,
        organizationId: ids.org,
        userId: ids.tenantUser1,
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah.johnson@email.com",
        phone: "(555) 234-5678",
        dateOfBirth: new Date("1990-04-12"),
        currentUnitId: ids.unitSF1,
        status: "ACTIVE",
        emergencyContactName: "Robert Johnson",
        emergencyContactPhone: "(555) 234-9999",
        employerName: "Tech Solutions Inc.",
        monthlyIncome: new Prisma.Decimal(6500),
        moveInDate: new Date("2024-01-15"),
      },
    }),
    prisma.tenant.create({
      data: {
        id: ids.tenant2,
        organizationId: ids.org,
        userId: ids.tenantUser2,
        firstName: "Mike",
        lastName: "Chen",
        email: "mike.chen@email.com",
        phone: "(555) 345-6789",
        dateOfBirth: new Date("1985-11-03"),
        currentUnitId: ids.unitDup1,
        status: "ACTIVE",
        emergencyContactName: "Lin Chen",
        emergencyContactPhone: "(555) 345-9999",
        employerName: "City Hospital",
        monthlyIncome: new Prisma.Decimal(5800),
        moveInDate: new Date("2023-08-01"),
      },
    }),
    prisma.tenant.create({
      data: {
        id: ids.tenant3,
        organizationId: ids.org,
        userId: ids.tenantUser3,
        firstName: "Emily",
        lastName: "Davis",
        email: "emily.davis@email.com",
        phone: "(555) 456-7890",
        dateOfBirth: new Date("1993-07-22"),
        currentUnitId: ids.unitDup2,
        status: "ACTIVE",
        emergencyContactName: "Karen Davis",
        emergencyContactPhone: "(555) 456-9999",
        employerName: "Davis & Associates Law",
        monthlyIncome: new Prisma.Decimal(7200),
        moveInDate: new Date("2024-03-01"),
      },
    }),
    prisma.tenant.create({
      data: {
        id: ids.tenant4,
        organizationId: ids.org,
        userId: ids.tenantUser4,
        firstName: "James",
        lastName: "Wilson",
        email: "james.wilson@email.com",
        phone: "(555) 567-8901",
        dateOfBirth: new Date("1988-02-14"),
        currentUnitId: ids.unitApt1,
        status: "ACTIVE",
        emergencyContactName: "Patricia Wilson",
        emergencyContactPhone: "(555) 567-9999",
        employerName: "Austin ISD",
        monthlyIncome: new Prisma.Decimal(4200),
        moveInDate: new Date("2023-06-01"),
      },
    }),
    prisma.tenant.create({
      data: {
        id: ids.tenant5,
        organizationId: ids.org,
        userId: ids.tenantUser5,
        firstName: "Maria",
        lastName: "Garcia",
        email: "maria.garcia@email.com",
        phone: "(555) 678-9012",
        dateOfBirth: new Date("1991-09-30"),
        currentUnitId: ids.unitApt3,
        status: "ACTIVE",
        emergencyContactName: "Carlos Garcia",
        emergencyContactPhone: "(555) 678-9999",
        employerName: "Freelance Design",
        monthlyIncome: new Prisma.Decimal(5500),
        moveInDate: new Date("2024-06-01"),
      },
    }),
  ]);
  console.log(`  Tenants: ${tenants.length} created`);

  // ─── Tenant Vehicles ───────────────────────────────────────────────

  await Promise.all([
    prisma.tenantVehicle.create({
      data: {
        tenantId: ids.tenant1,
        make: "Toyota",
        model: "Camry",
        year: 2022,
        color: "Silver",
        licensePlate: "ABC-1234",
        state: "TX",
      },
    }),
    prisma.tenantVehicle.create({
      data: {
        tenantId: ids.tenant2,
        make: "Honda",
        model: "Civic",
        year: 2021,
        color: "Blue",
        licensePlate: "DEF-5678",
        state: "TX",
      },
    }),
    prisma.tenantVehicle.create({
      data: {
        tenantId: ids.tenant4,
        make: "Ford",
        model: "F-150",
        year: 2020,
        color: "Black",
        licensePlate: "GHI-9012",
        state: "TX",
      },
    }),
  ]);
  console.log("  Tenant vehicles: 3 created");

  // ─── Tenant Pets ───────────────────────────────────────────────────

  await Promise.all([
    prisma.tenantPet.create({
      data: {
        tenantId: ids.tenant1,
        type: "Dog",
        breed: "Golden Retriever",
        name: "Max",
        weight: new Prisma.Decimal(65),
        vaccinated: true,
      },
    }),
    prisma.tenantPet.create({
      data: {
        tenantId: ids.tenant3,
        type: "Cat",
        breed: "Domestic Shorthair",
        name: "Luna",
        weight: new Prisma.Decimal(10),
        vaccinated: true,
      },
    }),
  ]);
  console.log("  Tenant pets: 2 created");

  // ─── Leases ────────────────────────────────────────────────────────

  const leases = await Promise.all([
    // Sarah Johnson — Oakwood Cottage
    prisma.lease.create({
      data: {
        id: ids.lease1,
        organizationId: ids.org,
        unitId: ids.unitSF1,
        startDate: new Date("2024-01-15"),
        endDate: new Date("2025-01-14"),
        monthlyRent: new Prisma.Decimal(1800),
        securityDeposit: new Prisma.Decimal(1800),
        lateFeeAmount: new Prisma.Decimal(75),
        lateFeeType: "FLAT",
        gracePeriodDays: 5,
        status: "ACTIVE",
        terms: {
          petDeposit: 300,
          petRent: 35,
          noSmoking: true,
          parkingSpaces: 2,
          utilitiesIncluded: ["Trash", "Water"],
        },
      },
    }),
    // Mike Chen — Elm Street Duplex A
    prisma.lease.create({
      data: {
        id: ids.lease2,
        organizationId: ids.org,
        unitId: ids.unitDup1,
        startDate: new Date("2023-08-01"),
        endDate: new Date("2025-07-31"),
        monthlyRent: new Prisma.Decimal(1400),
        securityDeposit: new Prisma.Decimal(1400),
        lateFeeAmount: new Prisma.Decimal(50),
        lateFeeType: "FLAT",
        gracePeriodDays: 5,
        status: "ACTIVE",
        terms: {
          noSmoking: true,
          parkingSpaces: 1,
          yardMaintenance: "tenant",
        },
      },
    }),
    // Emily Davis — Elm Street Duplex B
    prisma.lease.create({
      data: {
        id: ids.lease3,
        organizationId: ids.org,
        unitId: ids.unitDup2,
        startDate: new Date("2024-03-01"),
        endDate: new Date("2025-02-28"),
        monthlyRent: new Prisma.Decimal(1350),
        securityDeposit: new Prisma.Decimal(1350),
        lateFeeAmount: new Prisma.Decimal(50),
        lateFeeType: "FLAT",
        gracePeriodDays: 5,
        status: "ACTIVE",
        terms: {
          petDeposit: 250,
          petRent: 25,
          noSmoking: true,
          parkingSpaces: 1,
        },
      },
    }),
    // James Wilson — Riverside 101
    prisma.lease.create({
      data: {
        id: ids.lease4,
        organizationId: ids.org,
        unitId: ids.unitApt1,
        startDate: new Date("2023-06-01"),
        endDate: new Date("2025-05-31"),
        monthlyRent: new Prisma.Decimal(950),
        securityDeposit: new Prisma.Decimal(950),
        lateFeeAmount: new Prisma.Decimal(5),
        lateFeeType: "PERCENTAGE",
        gracePeriodDays: 3,
        status: "ACTIVE",
        terms: {
          noSmoking: true,
          parkingSpaces: 1,
        },
      },
    }),
    // Maria Garcia — Riverside 201
    prisma.lease.create({
      data: {
        id: ids.lease5,
        organizationId: ids.org,
        unitId: ids.unitApt3,
        startDate: new Date("2024-06-01"),
        endDate: new Date("2025-05-31"),
        monthlyRent: new Prisma.Decimal(1200),
        securityDeposit: new Prisma.Decimal(1200),
        lateFeeAmount: new Prisma.Decimal(60),
        lateFeeType: "FLAT",
        gracePeriodDays: 5,
        status: "ACTIVE",
        terms: {
          noSmoking: true,
          parkingSpaces: 1,
        },
      },
    }),
  ]);
  console.log(`  Leases: ${leases.length} created`);

  // ─── Lease Tenants ─────────────────────────────────────────────────

  await Promise.all([
    prisma.leaseTenant.create({
      data: {
        leaseId: ids.lease1,
        tenantId: ids.tenant1,
        isPrimary: true,
        signedAt: new Date("2024-01-10"),
        signatureData: {
          ip: "192.168.1.100",
          userAgent: "Mozilla/5.0",
          hash: "sha256-abc123def456",
          fullName: "Sarah Johnson",
          email: "sarah.johnson@email.com",
          timestamp: "2024-01-10T14:30:00Z",
        },
      },
    }),
    prisma.leaseTenant.create({
      data: {
        leaseId: ids.lease2,
        tenantId: ids.tenant2,
        isPrimary: true,
        signedAt: new Date("2023-07-25"),
        signatureData: {
          ip: "192.168.1.101",
          userAgent: "Mozilla/5.0",
          hash: "sha256-ghi789jkl012",
          fullName: "Mike Chen",
          email: "mike.chen@email.com",
          timestamp: "2023-07-25T10:15:00Z",
        },
      },
    }),
    prisma.leaseTenant.create({
      data: {
        leaseId: ids.lease3,
        tenantId: ids.tenant3,
        isPrimary: true,
        signedAt: new Date("2024-02-25"),
        signatureData: {
          ip: "192.168.1.102",
          userAgent: "Mozilla/5.0",
          hash: "sha256-mno345pqr678",
          fullName: "Emily Davis",
          email: "emily.davis@email.com",
          timestamp: "2024-02-25T16:45:00Z",
        },
      },
    }),
    prisma.leaseTenant.create({
      data: {
        leaseId: ids.lease4,
        tenantId: ids.tenant4,
        isPrimary: true,
        signedAt: new Date("2023-05-28"),
        signatureData: {
          ip: "192.168.1.103",
          userAgent: "Mozilla/5.0",
          hash: "sha256-stu901vwx234",
          fullName: "James Wilson",
          email: "james.wilson@email.com",
          timestamp: "2023-05-28T09:00:00Z",
        },
      },
    }),
    prisma.leaseTenant.create({
      data: {
        leaseId: ids.lease5,
        tenantId: ids.tenant5,
        isPrimary: true,
        signedAt: new Date("2024-05-28"),
        signatureData: {
          ip: "192.168.1.104",
          userAgent: "Mozilla/5.0",
          hash: "sha256-yza567bcd890",
          fullName: "Maria Garcia",
          email: "maria.garcia@email.com",
          timestamp: "2024-05-28T11:30:00Z",
        },
      },
    }),
  ]);
  console.log("  Lease tenants: 5 linked");

  // ─── Expense Categories (mapped to IRS Schedule E) ─────────────────

  const scheduleECategories = [
    { name: "Advertising", scheduleELine: "Line 5", isDefault: true },
    {
      name: "Auto and Travel",
      scheduleELine: "Line 6",
      isDefault: true,
    },
    {
      name: "Cleaning and Maintenance",
      scheduleELine: "Line 7",
      isDefault: true,
    },
    { name: "Commissions", scheduleELine: "Line 8", isDefault: true },
    { name: "Insurance", scheduleELine: "Line 9", isDefault: true },
    {
      name: "Legal and Professional Fees",
      scheduleELine: "Line 10",
      isDefault: true,
    },
    {
      name: "Management Fees",
      scheduleELine: "Line 11",
      isDefault: true,
    },
    {
      name: "Mortgage Interest",
      scheduleELine: "Line 12",
      isDefault: true,
    },
    {
      name: "Other Interest",
      scheduleELine: "Line 13",
      isDefault: true,
    },
    {
      name: "Repairs",
      scheduleELine: "Line 14",
      isDefault: true,
    },
    { name: "Supplies", scheduleELine: "Line 15", isDefault: true },
    { name: "Taxes", scheduleELine: "Line 16", isDefault: true },
    { name: "Utilities", scheduleELine: "Line 17", isDefault: true },
    {
      name: "Depreciation",
      scheduleELine: "Line 18",
      isDefault: true,
    },
    { name: "Other", scheduleELine: "Line 19", isDefault: true },
    // Non-Schedule-E categories
    { name: "Rent Income", scheduleELine: "Line 3", isDefault: true },
    { name: "Capital Improvements", scheduleELine: null, isDefault: true },
    { name: "HOA Fees", scheduleELine: null, isDefault: true },
  ];

  await Promise.all(
    scheduleECategories.map((cat) =>
      prisma.expenseCategory.create({
        data: {
          organizationId: ids.org,
          name: cat.name,
          scheduleELine: cat.scheduleELine,
          isDefault: cat.isDefault,
          isActive: true,
        },
      })
    )
  );
  console.log(`  Expense categories: ${scheduleECategories.length} created`);

  // ─── Vendors ───────────────────────────────────────────────────────

  await Promise.all([
    prisma.vendor.create({
      data: {
        id: ids.vendor1,
        organizationId: ids.org,
        companyName: "Austin Plumbing Pros",
        contactName: "Dave Martinez",
        email: "dave@austinplumbing.com",
        phone: "(555) 111-2222",
        specialty: "Plumbing",
        serviceArea: "Austin Metro",
        insuranceExpiry: new Date("2026-12-31"),
        rating: new Prisma.Decimal(4.8),
        notes: "Reliable, usually available same day for emergencies.",
        isActive: true,
      },
    }),
    prisma.vendor.create({
      data: {
        id: ids.vendor2,
        organizationId: ids.org,
        companyName: "Lone Star HVAC",
        contactName: "Amy Foster",
        email: "service@lonestarhvac.com",
        phone: "(555) 333-4444",
        specialty: "HVAC",
        serviceArea: "Central Texas",
        insuranceExpiry: new Date("2026-09-15"),
        rating: new Prisma.Decimal(4.5),
        notes: "Good rates on seasonal maintenance contracts.",
        isActive: true,
      },
    }),
  ]);
  console.log("  Vendors: 2 created");

  // ─── Transactions (last 3 months) ─────────────────────────────────

  // Generate rent payment transactions for each occupied unit, past 3 months
  const rentTransactions: Prisma.TransactionCreateManyInput[] = [];
  const rentPayments: {
    leaseId: string;
    tenantId: string;
    amount: number;
    paidAt: Date;
  }[] = [];

  const occupiedUnits = [
    {
      unitId: ids.unitSF1,
      tenantId: ids.tenant1,
      leaseId: ids.lease1,
      rent: 1800,
      propertyId: ids.singleFamily,
    },
    {
      unitId: ids.unitDup1,
      tenantId: ids.tenant2,
      leaseId: ids.lease2,
      rent: 1400,
      propertyId: ids.duplex,
    },
    {
      unitId: ids.unitDup2,
      tenantId: ids.tenant3,
      leaseId: ids.lease3,
      rent: 1350,
      propertyId: ids.duplex,
    },
    {
      unitId: ids.unitApt1,
      tenantId: ids.tenant4,
      leaseId: ids.lease4,
      rent: 950,
      propertyId: ids.apartment,
    },
    {
      unitId: ids.unitApt3,
      tenantId: ids.tenant5,
      leaseId: ids.lease5,
      rent: 1200,
      propertyId: ids.apartment,
    },
  ];

  for (let monthOffset = 3; monthOffset >= 1; monthOffset--) {
    for (const unit of occupiedUnits) {
      const payDate = monthsAgo(monthOffset);
      payDate.setDate(1); // Rent paid on the 1st

      rentTransactions.push({
        organizationId: ids.org,
        propertyId: unit.propertyId,
        unitId: unit.unitId,
        tenantId: unit.tenantId,
        type: "INCOME",
        category: "Rent Income",
        amount: new Prisma.Decimal(unit.rent),
        date: payDate,
        description: `Rent payment - ${payDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
      });

      rentPayments.push({
        leaseId: unit.leaseId,
        tenantId: unit.tenantId,
        amount: unit.rent,
        paidAt: payDate,
      });
    }
  }

  // Expense transactions
  const expenseTransactions: Prisma.TransactionCreateManyInput[] = [
    // Month 1 (3 months ago)
    {
      organizationId: ids.org,
      propertyId: ids.singleFamily,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(185),
      date: monthsAgo(3),
      description: "Monthly property insurance premium - Oakwood Cottage",
    },
    {
      organizationId: ids.org,
      propertyId: ids.duplex,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(240),
      date: monthsAgo(3),
      description: "Monthly property insurance premium - Elm Street Duplex",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(380),
      date: monthsAgo(3),
      description:
        "Monthly property insurance premium - Riverside Apartments",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      unitId: ids.unitApt1,
      type: "EXPENSE",
      category: "Repairs",
      amount: new Prisma.Decimal(275),
      date: monthsAgo(3),
      description: "Kitchen faucet replacement - Unit 101",
      vendorId: ids.vendor1,
    },
    // Month 2 (2 months ago)
    {
      organizationId: ids.org,
      propertyId: ids.singleFamily,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(185),
      date: monthsAgo(2),
      description: "Monthly property insurance premium - Oakwood Cottage",
    },
    {
      organizationId: ids.org,
      propertyId: ids.duplex,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(240),
      date: monthsAgo(2),
      description: "Monthly property insurance premium - Elm Street Duplex",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(380),
      date: monthsAgo(2),
      description:
        "Monthly property insurance premium - Riverside Apartments",
    },
    {
      organizationId: ids.org,
      propertyId: ids.duplex,
      unitId: ids.unitDup2,
      type: "EXPENSE",
      category: "Cleaning and Maintenance",
      amount: new Prisma.Decimal(150),
      date: monthsAgo(2),
      description: "Lawn care service - Elm Street Duplex",
    },
    {
      organizationId: ids.org,
      propertyId: ids.singleFamily,
      type: "EXPENSE",
      category: "Repairs",
      amount: new Prisma.Decimal(420),
      date: monthsAgo(2),
      description: "HVAC annual inspection and filter replacement",
      vendorId: ids.vendor2,
    },
    // Month 3 (1 month ago)
    {
      organizationId: ids.org,
      propertyId: ids.singleFamily,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(185),
      date: monthsAgo(1),
      description: "Monthly property insurance premium - Oakwood Cottage",
    },
    {
      organizationId: ids.org,
      propertyId: ids.duplex,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(240),
      date: monthsAgo(1),
      description: "Monthly property insurance premium - Elm Street Duplex",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      type: "EXPENSE",
      category: "Insurance",
      amount: new Prisma.Decimal(380),
      date: monthsAgo(1),
      description:
        "Monthly property insurance premium - Riverside Apartments",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      type: "EXPENSE",
      category: "Utilities",
      amount: new Prisma.Decimal(320),
      date: monthsAgo(1),
      description: "Common area electricity - Riverside Apartments",
    },
    {
      organizationId: ids.org,
      propertyId: ids.apartment,
      type: "EXPENSE",
      category: "Cleaning and Maintenance",
      amount: new Prisma.Decimal(200),
      date: monthsAgo(1),
      description: "Common area cleaning - Riverside Apartments",
    },
    // Mortgage interest (monthly for all 3 properties, 3 months)
    ...Array.from({ length: 3 }, (_, i) => [
      {
        organizationId: ids.org,
        propertyId: ids.singleFamily,
        type: "EXPENSE" as const,
        category: "Mortgage Interest",
        amount: new Prisma.Decimal(980),
        date: monthsAgo(3 - i),
        description: `Mortgage payment - Oakwood Cottage`,
      },
      {
        organizationId: ids.org,
        propertyId: ids.duplex,
        type: "EXPENSE" as const,
        category: "Mortgage Interest",
        amount: new Prisma.Decimal(1650),
        date: monthsAgo(3 - i),
        description: `Mortgage payment - Elm Street Duplex`,
      },
      {
        organizationId: ids.org,
        propertyId: ids.apartment,
        type: "EXPENSE" as const,
        category: "Mortgage Interest",
        amount: new Prisma.Decimal(2780),
        date: monthsAgo(3 - i),
        description: `Mortgage payment - Riverside Apartments`,
      },
    ]).flat(),
  ];

  await prisma.transaction.createMany({
    data: [...rentTransactions, ...expenseTransactions],
  });
  console.log(
    `  Transactions: ${rentTransactions.length + expenseTransactions.length} created (${rentTransactions.length} income, ${expenseTransactions.length} expenses)`
  );

  // ─── Payments ──────────────────────────────────────────────────────

  await prisma.payment.createMany({
    data: rentPayments.map((p) => ({
      organizationId: ids.org,
      leaseId: p.leaseId,
      tenantId: p.tenantId,
      amount: new Prisma.Decimal(p.amount),
      status: "COMPLETED" as const,
      method: "ACH" as const,
      netAmount: new Prisma.Decimal(p.amount),
      paidAt: p.paidAt,
    })),
  });
  console.log(`  Payments: ${rentPayments.length} created`);

  // ─── Maintenance Requests ──────────────────────────────────────────

  await Promise.all([
    // Completed request
    prisma.maintenanceRequest.create({
      data: {
        id: ids.maint1,
        organizationId: ids.org,
        propertyId: ids.apartment,
        unitId: ids.unitApt1,
        tenantId: ids.tenant4,
        title: "Kitchen faucet leaking",
        description:
          "The kitchen faucet has been dripping steadily. It's wasting water and the drip sound is noticeable at night.",
        priority: "URGENT",
        status: "COMPLETED",
        category: "Plumbing",
        photos: ["/uploads/maint/faucet-leak-1.jpg"],
        scheduledDate: daysAgo(85),
        completedDate: daysAgo(83),
        cost: new Prisma.Decimal(275),
        vendorId: ids.vendor1,
        notes: "Replaced faucet cartridge and installed new O-rings.",
      },
    }),
    // In-progress request
    prisma.maintenanceRequest.create({
      data: {
        id: ids.maint2,
        organizationId: ids.org,
        propertyId: ids.singleFamily,
        unitId: ids.unitSF1,
        tenantId: ids.tenant1,
        title: "AC not cooling properly",
        description:
          "The air conditioning is running but the house isn't cooling below 78 degrees even with thermostat set to 72.",
        priority: "URGENT",
        status: "SCHEDULED",
        category: "HVAC",
        photos: [
          "/uploads/maint/thermostat-1.jpg",
          "/uploads/maint/ac-unit-1.jpg",
        ],
        scheduledDate: monthsFromNow(0),
        vendorId: ids.vendor2,
        notes:
          "Scheduled HVAC technician for inspection. Possible refrigerant leak or compressor issue.",
      },
    }),
    // Newly submitted request
    prisma.maintenanceRequest.create({
      data: {
        id: ids.maint3,
        organizationId: ids.org,
        propertyId: ids.duplex,
        unitId: ids.unitDup2,
        tenantId: ids.tenant3,
        title: "Bathroom exhaust fan not working",
        description:
          "The bathroom exhaust fan makes a grinding noise and doesn't seem to be pulling air anymore. Moisture is building up on the walls after showers.",
        priority: "ROUTINE",
        status: "SUBMITTED",
        category: "Electrical",
        photos: ["/uploads/maint/exhaust-fan-1.jpg"],
      },
    }),
  ]);
  console.log("  Maintenance requests: 3 created");

  // ─── Notification Preferences ──────────────────────────────────────

  const notifTypes = [
    "payment_received",
    "payment_failed",
    "lease_expiring",
    "maintenance_update",
    "new_message",
    "new_application",
  ];

  await prisma.notificationPreference.createMany({
    data: notifTypes.map((type) => ({
      userId: ids.ownerUser,
      type,
      emailEnabled: true,
      smsEnabled: type === "payment_failed" || type === "maintenance_update",
      pushEnabled: true,
    })),
  });
  console.log(`  Notification preferences: ${notifTypes.length} created`);

  console.log("\nSeed completed successfully!");
  console.log("\n  Login credentials:");
  console.log("  ─────────────────────────────────────");
  console.log("  Owner:  demo@brevva.io / demo1234");
  console.log("  Tenant: sarah.johnson@email.com / tenant1234");
  console.log("  Tenant: mike.chen@email.com / tenant1234");
  console.log("  ─────────────────────────────────────\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
