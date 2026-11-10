import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, IdentityError } from "@/lib/identity";
import { GymProfileForm } from "@/components/gym-profile-form";
import { readGymProfile } from "@/lib/gym-profile";

export default async function ProfilePage() {
  const requestHeaders = await headers();
  const actor = await getActor(requestHeaders).catch(error => { if (error instanceof IdentityError) redirect("/login"); throw error; });
  const gym = await readGymProfile(requestHeaders);
  return <GymProfileForm owner={actor.operator.role === "OWNER"} initial={{ name: gym.name, contactEmail: gym.contactEmail ?? "", phone: gym.phone ?? "", address: gym.address ?? "", profileTimezone: gym.profileTimezone, profileCountry: gym.profileCountry, profileCurrency: gym.profileCurrency, profileVersion: gym.profileVersion }} />;
}
