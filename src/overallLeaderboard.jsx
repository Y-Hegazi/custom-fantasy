import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { doc, getDoc, collection, query, onSnapshot, orderBy, getDocs, writeBatch } from "firebase/firestore";

function OverallLeaderboard({ leagueId }) {
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch League Members if viewing a league
            let leagueMembers = null;
            if (leagueId) {
                const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
                if (leagueDoc.exists()) {
                    leagueMembers = leagueDoc.data().members || [];
                } else {
                    console.error("League not found");
                }
            }

            // 2. Subscribe to Users
            const usersRef = collection(db, "users");
            const q = query(usersRef, orderBy("totalScore", "desc"));
            
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
              const playersList = [];
              querySnapshot.forEach((doc) => {
                // FILTER LOGIC
                if (leagueMembers && !leagueMembers.includes(doc.id)) {
                    return;
                }

                playersList.push({
                  id: doc.id,
                  name: doc.data().displayName,
                  points: doc.data().totalScore || 0
                });
              });
              setPlayers(playersList);
              setIsLoading(false);
            });
            return unsubscribe; // Return the function to clean up
        } catch (e) {
            console.error(e);
            setIsLoading(false);
        }
    };

    // We need to manage the unsubscribe manually since we made the effect async
    let unsubscribeFunc = null;
    fetchLeaderboard().then(unsub => {
        if (typeof unsub === 'function') unsubscribeFunc = unsub;
    });

    return () => {
        if (unsubscribeFunc) unsubscribeFunc();
    };

  }, [leagueId]);
  
  if (isLoading) {
    return <div className="loading-container"><h3>Loading Overall Leaderboard...</h3></div>;
  }

  return (
    <div className="leaderboard-container">
      <h3>Overall Season Leaderboard</h3>
      {players.length > 0 ? (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Total Points</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.id}>
                <td>{index + 1}</td>
                <td>{player.name}</td>
                <td>{player.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No players have scored points yet.</p>
      )}
    </div>
  );
}

export default OverallLeaderboard;

