import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(__dirname, '../service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account file not found!');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath)
});

const db = admin.firestore();

async function seedDatabase(): Promise<void> {
  try {
    console.log('Starting database seeding...');

    // Create default permissions
    const permissionsCollection = db.collection('permissions');
    const permissions = [
      {
        name: 'Create Users',
        description: 'Ability to create new users',
        resource: 'users',
        action: 'create'
      },
      {
        name: 'Read Users',
        description: 'Ability to view user details',
        resource: 'users',
        action: 'read'
      },
      {
        name: 'Update Users',
        description: 'Ability to modify user details',
        resource: 'users',
        action: 'update'
      },
      {
        name: 'Delete Users',
        description: 'Ability to remove users',
        resource: 'users',
        action: 'delete'
      },
      {
        name: 'Manage Users',
        description: 'Full control over users',
        resource: 'users',
        action: 'manage'
      },
      {
        name: 'Create Roles',
        description: 'Ability to create roles',
        resource: 'roles',
        action: 'create'
      },
      {
        name: 'Read Roles',
        description: 'Ability to view roles',
        resource: 'roles',
        action: 'read'
      },
      {
        name: 'Update Roles',
        description: 'Ability to modify roles',
        resource: 'roles',
        action: 'update'
      },
      {
        name: 'Delete Roles',
        description: 'Ability to remove roles',
        resource: 'roles',
        action: 'delete'
      },
      {
        name: 'Manage Roles',
        description: 'Full control over roles',
        resource: 'roles',
        action: 'manage'
      },
      {
        name: 'Create Permissions',
        description: 'Ability to create permissions',
        resource: 'permissions',
        action: 'create'
      },
      {
        name: 'Read Permissions',
        description: 'Ability to view permissions',
        resource: 'permissions',
        action: 'read'
      },
      {
        name: 'System Admin',
        description: 'Full system access',
        resource: '*',
        action: 'manage'
      }
    ];

    const permissionIds: Record<string, string> = {};

    // Add permissions
    for (const permission of permissions) {
      const docRef = permissionsCollection.doc();
      const permissionWithId = { id: docRef.id, ...permission };
      await docRef.set(permissionWithId);
      
      // Store the ID mapping for role creation
      permissionIds[permission.name] = docRef.id;
      console.log('Created permission: ' + permission.name);
    }

    // Create default roles
    const rolesCollection = db.collection('roles');
    
    // Admin role
    const adminRole = {
      name: 'Administrator',
      description: 'Full system administrator',
      permissions: [permissionIds['System Admin']]
    };
    
    const adminRoleRef = rolesCollection.doc();
    await adminRoleRef.set({ id: adminRoleRef.id, ...adminRole });
    console.log('Created role: Administrator');
    
    // User Manager role
    const userManagerRole = {
      name: 'User Manager',
      description: 'Can manage users but not roles or permissions',
      permissions: [
        permissionIds['Manage Users'],
        permissionIds['Read Roles'],
        permissionIds['Read Permissions']
      ]
    };
    
    const userManagerRoleRef = rolesCollection.doc();
    await userManagerRoleRef.set({ id: userManagerRoleRef.id, ...userManagerRole });
    console.log('Created role: User Manager');
    
    // Create initial admin user
    const email = 'admin@solvejet.net';
    const password = 'admin123';  // This should be changed immediately
    
    try {
      // Check if user already exists
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log(`Admin user already exists: ${userRecord.uid}`);
      
      // Ensure admin role is assigned
      await db.collection('userRoles').doc(userRecord.uid).set({
        userId: userRecord.uid,
        roleIds: [adminRoleRef.id]
      });
      
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create new admin user
        const userRecord = await admin.auth().createUser({
          email,
          password,
          emailVerified: true,
          displayName: 'System Administrator'
        });
        
        // Assign admin role
        await db.collection('userRoles').doc(userRecord.uid).set({
          userId: userRecord.uid,
          roleIds: [adminRoleRef.id]
        });
        
        console.log(`Created admin user: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedDatabase();