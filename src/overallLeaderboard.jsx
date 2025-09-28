import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";

function OverallLeaderboard() {
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const usersRef = collection(db, "users");
    // Query the users collection and order by totalScore in descending order
    const q = query(usersRef, orderBy("totalScore", "desc"));

    // Use onSnapshot for real-time updates
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const playersList = [];
      querySnapshot.forEach((doc) => {
        playersList.push({
          id: doc.id,
          name: doc.data().displayName,
          points: doc.data().totalScore || 0
        });
      });
      setPlayers(playersList);
      setIsLoading(false);
    });

    // Clean up the listener when the component unmounts
    return () => unsubscribe();
  }, []);

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
