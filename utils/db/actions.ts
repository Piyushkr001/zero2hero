
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./dbConfig";
import { Notifications, Transactions, Users, Reports, Rewards, CollectedWaste } from "./schema";

export async function createUser(email: string, name: string) {
   try {
      const [user] = await db.insert(Users).values({ email, name }).returning().execute();
      return user;
   } catch (error) {
      console.error("Error creating user:", error);
      return null;
   }
}

export async function getUserByEmail(email: string) {
   try {
      const [user] = await db.select().from(Users).where(eq(Users.email, email)).execute();
      return user;
   } catch (error) {
      console.error('Error fetching user by email', error);
      return null;

   }
}

export async function getUnreadNotifications(userId: number) {
   try {
      return await db.select().from(Notifications).where(and(eq(Notifications.userId, userId), eq(Notifications.isRead, false))).execute();
   } catch (error) {
      console.error('Error fetching unread notifications', error);
      return null;

   }
}

export async function getRewardTransactions(userId: number) {
   try {
      const transactions = await db.select({
         id: Transactions.id,
         type: Transactions.type,
         amount: Transactions.amount,
         description: Transactions.description,
         date: Transactions.date,
      }).from(Transactions).where(eq(Transactions.userId, userId)).orderBy(desc(Transactions.date)).limit(10).execute();

      const formattedTransactions = transactions.map((t) => ({
         ...t,
         date: t.date.toISOString().split('T')[0], //YYYY-MM-DD
      }));
      return formattedTransactions;
   } catch (error) {
      console.error('Error fetching reward transactions', error);
      return null;

   }
}

export async function getUserBalance(userId: number): Promise<number> {

   const transactions = await getRewardTransactions(userId) || [];
   const balance = transactions.reduce((acc: number, transaction: any) => {
      if (!transaction) return 0;
      return transaction.type.startsWith('earned') ? acc + transaction.amount : acc - transaction.amount;
   }, 0);
   return Math.max(balance, 0)

}

export async function markNotificationAsRead(notificationId: number) {
   try {
      await db.update(Notifications).set({ isRead: true }).where(eq(Notifications.id, notificationId)).execute()
   } catch (error) {
      console.error('Error marking notification as read', error);
      return null;
   }
}

export async function createReport(
   userId: number,
   location: string,
   wasteType: string,
   amount: string,
   imageUrl?: string,
   verificationResult?: any
) {
   try {
      const [report] = await db.insert(Reports).values({
         userId, location, wasteType, amount, imageUrl, verificationResult, status: 'pending'
      }).returning().execute();
      const pointsEarned = 10;
      await updateRewardPoints(userId, pointsEarned);
      await createTransaction(userId, 'earned_report', pointsEarned, 'Points earned for reporting waste');
      await createNotification(userId, `You have earned ${pointsEarned} points for reporting waste!`, 'reward');
      return report;
   } catch (error) {
      console.error('Error creating report', error);
      return null;
   }
}

export async function updateRewardPoints(userId: number, pointsToAdd: number) {
   try {
      const [updatedReward] = await db.update(Rewards).set({ points: sql`${Rewards.points} + ${pointsToAdd}` }).where(eq(Rewards.userId, userId)).returning().execute();
      return updatedReward;
   } catch (error) {
      console.error('Error updating reward points', error);
   }
}

export async function createTransaction(userId: number, type: 'earned_report' | 'earned_collect' | 'redeemed', amount: number, description?: string) {
   try {
      const [transaction] = await db
         .insert(Transactions)
         //@ts-ignore
         .values({ userId, type, amount, description })
         .returning()
         .execute();
      return transaction;
   } catch (error) {
      console.error("Error creating transaction", error);
      throw error;
   }
}

export async function createNotification(userId: number, message: string, type: string) {
   try {
      const [notification] = await db
         .insert(Notifications)
         .values({ userId, message, type })
         .returning()
         .execute();
      return notification;
   } catch (error) {
      console.error("Error creating notification:", error);
      return null;
   }
}

export async function getRecentReports(limit: number = 10) {
   try {
      const reports = await db.select().from(Reports).orderBy(desc(Reports.createdAt)).limit(limit).execute();
      return reports;
   } catch (error) {
      console.error('Error fetching recent reports', error);
      return [];
   }
}

export async function getAvailableRewards (userId : number) {
   try {
      const userTransaction = await getRewardTransactions(userId) as any;
      const userPoints = userTransaction?.reduce((total: any, transaction: any)=>{
         return transaction.type.startsWith('earned') ? total + transaction.amount : total - transaction.amount;
      },0);
      const dbRewards = await db.select({
         id: Rewards.id,
         name: Rewards.name,
         //@ts-ignore
         cost: Rewards.cost,
         description: Rewards.description,
         collectionInfo: Rewards.collectinInfo,
      }).from(Rewards).where(eq(Rewards.isAvailable, true)).execute()

      const allRewards = [
         {
            id:0,
            name: 'Your Points',
            cost: userPoints,
            description: 'Redeem your earned points',
            collectionInfo: 'Points earned from reporting and collecting waste'
         },
         ...dbRewards
      ];
      return allRewards;
   } catch (error) {
      console.error("Error fetching available rewards", error);
      return [];
   }
}

export async function getWasteCollectionTasks(limit: number = 20) {
   try {
     const tasks = await db
       .select({
         id: Reports.id,
         location: Reports.location,
         wasteType: Reports.wasteType,
         amount: Reports.amount,
         status: Reports.status,
         date: Reports.createdAt,
         collectorId: Reports.collectorId,
       })
       .from(Reports)
       .limit(limit)
       .execute();
 
     return tasks.map(task => ({
       ...task,
       date: task.date.toISOString().split('T')[0], // Format date as YYYY-MM-DD
     }));
   } catch (error) {
     console.error("Error fetching waste collection tasks:", error);
     return [];
   }
 }

 export async function updateTaskStatus(reportId: number, newStatus: string, collectorId:number ) {
   try {
      const updateData: any = {status: newStatus};
      if (collectorId !== undefined) {
         updateData.collectorId = collectorId;
      }

      const [updateReport] = await db.update(Reports).set(updateData).where(eq(Reports.id, reportId)).returning().execute();
      return updateReport;
   } catch (error) {
      console.error('Error updating task status');
      throw error;
   }
 }

 export async function saveReward(userId: number, amount: number) {
   try {
      //@ts-ignore
   const [reward] = await db.insert(Rewards).values({
      userId,
      name: 'Waste Collection Reward',
      collectedInfo: 'Points earned from waste collection',
      points:amount,
      level:1,
      isAvailable: true,
   }).returning().execute();
   
   await createTransaction(userId, 'earned_collect', amount, 'Poinst earned for collecting waste');
   return reward;
   } catch (error) {
      console.error("Error saving reward:", error);
      throw error;
   }
 }

 export async function saveCollectedWaste(reportId: number, collectorId: number, verificationResult: any) {
   try {
     const [collectedWaste] = await db
       .insert(CollectedWaste)
       .values({
         reportId,
         collectorId,
         collectionDate: new Date(),
         status: 'verified',
       })
       .returning()
       .execute();
     return collectedWaste;
   } catch (error) {
     console.error("Error saving collected waste:", error);
     throw error;
   }
 }

 export async function redeemReward(userId: number, rewardId: number) {
   try {
     const userReward = await getOrCreateReward(userId) as any;
     
     if (rewardId === 0) {
       // Redeem all points
       const [updatedReward] = await db.update(Rewards)
         .set({ 
           points: 0,
           updatedAt: new Date(),
         })
         .where(eq(Rewards.userId, userId))
         .returning()
         .execute();
 
       // Create a transaction for this redemption
       await createTransaction(userId, 'redeemed', userReward.points, `Redeemed all points: ${userReward.points}`);
 
       return updatedReward;
     } else {
       // Existing logic for redeeming specific rewards
       const availableReward = await db.select().from(Rewards).where(eq(Rewards.id, rewardId)).execute();
 
       if (!userReward || !availableReward[0] || userReward.points < availableReward[0].points) {
         throw new Error("Insufficient points or invalid reward");
       }
 
       const [updatedReward] = await db.update(Rewards)
         .set({ 
           points: sql`${Rewards.points} - ${availableReward[0].points}`,
           updatedAt: new Date(),
         })
         .where(eq(Rewards.userId, userId))
         .returning()
         .execute();
 
       // Create a transaction for this redemption
       await createTransaction(userId, 'redeemed', availableReward[0].points, `Redeemed: ${availableReward[0].name}`);
 
       return updatedReward;
     }
   } catch (error) {
     console.error("Error redeeming reward:", error);
     throw error;
   }
 }

 export async function getOrCreateReward(userId: number) {
   try {
     let [reward] = await db.select().from(Rewards).where(eq(Rewards.userId, userId)).execute();
     if (!reward) {
      //@ts-ignore
       [reward] = await db.insert(Rewards).values({
         userId,
         name: 'Default Reward',
         collectionInfo: 'Default Collection Info',
         points: 0,
         level: 1,
         isAvailable: true,
       }).returning().execute();
     }
     return reward;
   } catch (error) {
     console.error("Error getting or creating reward:", error);
     return null;
   }
 }

 export async function getAllRewards() {
   try {
     const rewards = await db
       .select({
         id: Rewards.id,
         userId: Rewards.userId,
         points: Rewards.points,
         //@ts-ignore
         level: Rewards.level,
         createdAt: Rewards.createdAt,
         userName: Users.name,
       })
       .from(Rewards)
       .leftJoin(Users, eq(Rewards.userId, Users.id))
       .orderBy(desc(Rewards.points))
       .execute();
 
     return rewards;
   } catch (error) {
     console.error("Error fetching all rewards:", error);
     return [];
   }
 }

 